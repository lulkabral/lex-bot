"""
Servidor FastAPI do Lex — Consumer AI Agent (SaaS B2C)
API com CORS liberado + serviço do PWA (frontend) na mesma origem.
"""

import os
import json
from typing import Optional, Dict, List, Any

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from database import db
from agent import agent

app = FastAPI(
    title="Lex - Consumer AI Agent Backend",
    description="Backend oficial do Lex: raposa agente de IA para pessoas comuns",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str = ""
    image: Optional[str] = None
    history: List[Dict[str, str]] = []


def _agent_payload(result: Dict[str, Any], **extra) -> Dict[str, Any]:
    """Formato único de resposta para /api/chat e /api/audio."""
    return {
        "success": True,
        "message": result.get("message", ""),
        "state": result.get("state", "idle"),
        "computer_steps": result.get("computer_steps", []),
        "confirmation_card": result.get("confirmation_card"),
        "confirmation_cards": result.get("confirmation_cards", []),
        "tool_executed": result.get("tool_executed"),
        "tools_executed": result.get("tools_executed", []),
        "backpack": db.get_backpack(),
        **extra,
    }


def _backpack_payload(res: Dict[str, Any]) -> Dict[str, Any]:
    return {"success": res.get("success", False), "message": res.get("message", ""), "backpack": db.get_backpack()}


# ============================================================================
# Rotas da API
# ============================================================================
@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "agent": "Lex",
        "groq_configured": bool(agent.client),
        "model": agent.model,
        "backpack_items": db.get_backpack()["total_items"],
    }


@app.post("/api/chat")
def chat_endpoint(payload: ChatRequest):
    """Recebe a mensagem (+ histórico e foto opcional) e aciona o agente."""
    if not payload.message.strip() and not payload.image:
        raise HTTPException(status_code=400, detail="Mensagem ou imagem necessária.")
    result = agent.process_message(payload.message, payload.image, payload.history)
    return _agent_payload(result)


@app.post("/api/audio")
async def audio_endpoint(file: UploadFile = File(...), history: Optional[str] = Form(None)):
    """Transcreve o áudio com Groq Whisper (whisper-large-v3-turbo) e aciona o agente."""
    if not agent.client:
        raise HTTPException(status_code=503, detail="Configure GROQ_API_KEY em backend/.env para usar a voz.")

    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Áudio vazio.")

    try:
        transcription = agent.client.audio.transcriptions.create(
            model="whisper-large-v3-turbo",
            file=(file.filename or "audio.webm", audio_bytes, file.content_type or "audio/webm"),
            language="pt",
            response_format="json",
        )
        text = (transcription.text or "").strip()
    except Exception as err:
        print(f"[Whisper Error] {err}")
        raise HTTPException(status_code=502, detail="Não consegui transcrever o áudio. Tente novamente.")

    if not text:
        raise HTTPException(status_code=422, detail="Não entendi nada no áudio. Pode repetir mais perto do microfone?")

    try:
        parsed_history = json.loads(history) if history else []
        if not isinstance(parsed_history, list):
            parsed_history = []
    except Exception:
        parsed_history = []

    result = agent.process_message(text, history=parsed_history)
    return _agent_payload(result, transcription=text)


@app.get("/api/backpack")
def get_backpack_endpoint():
    return {"success": True, "backpack": db.get_backpack()}


@app.delete("/api/backpack/table/{table_id}")
def delete_table_endpoint(table_id: str):
    return _backpack_payload(db.delete_table(table_id))


@app.delete("/api/backpack/table/{table_id}/row/{row_index}")
def delete_table_row_endpoint(table_id: str, row_index: int):
    return _backpack_payload(db.delete_table_row(table_id, row_index))


@app.delete("/api/backpack/flashcard/{deck_id}")
def delete_flashcard_deck_endpoint(deck_id: str):
    return _backpack_payload(db.delete_flashcard_deck(deck_id))


@app.delete("/api/backpack/agenda/{event_id}")
def delete_agenda_endpoint(event_id: str):
    return _backpack_payload(db.delete_appointment(event_id))


@app.patch("/api/backpack/agenda/{event_id}/toggle")
def toggle_agenda_endpoint(event_id: str):
    return _backpack_payload(db.toggle_appointment(event_id))


@app.delete("/api/backpack/summary/{summary_id}")
def delete_summary_endpoint(summary_id: str):
    return _backpack_payload(db.delete_summary(summary_id))


@app.post("/api/undo")
def undo_endpoint():
    return _backpack_payload(db.undo_last_action())


# ============================================================================
# Frontend PWA
# ============================================================================
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")

if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

    @app.get("/")
    def serve_index():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

    @app.get("/manifest.json")
    def serve_manifest():
        return FileResponse(os.path.join(FRONTEND_DIR, "manifest.json"))

    @app.get("/sw.js")
    def serve_sw():
        return FileResponse(os.path.join(FRONTEND_DIR, "sw.js"), media_type="application/javascript")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
