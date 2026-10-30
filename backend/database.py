"""
Lex Database & Backpack Storage
Persistência local em JSON (lex_backpack.json) estruturada como tabelas de usuário,
com snapshots para Desfazer. Pronta para futura migração para Supabase.
"""

import json
import os
import copy
import uuid
from datetime import datetime
from typing import Dict, Any, List

DB_FILE = os.path.join(os.path.dirname(__file__), "lex_backpack.json")
SECTIONS = ("tables", "flashcards", "agenda", "summaries")
MAX_HISTORY = 20


def _new_id(prefix: str) -> str:
    """IDs únicos mesmo quando várias ações acontecem no mesmo segundo."""
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def get_initial_seed() -> Dict[str, Any]:
    """Mochila nova começa vazia: tudo nela é criado pelo próprio usuário."""
    return {"tables": [], "flashcards": [], "agenda": [], "summaries": [], "history": []}


class BackpackDB:
    def __init__(self, filepath: str = DB_FILE):
        self.filepath = filepath
        self._ensure_db()

    # ------------------------------------------------------------------
    # I/O
    # ------------------------------------------------------------------
    def _ensure_db(self):
        if not os.path.exists(self.filepath):
            self.save_data(get_initial_seed())

    def load_data(self) -> Dict[str, Any]:
        self._ensure_db()
        try:
            with open(self.filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = get_initial_seed()
        for key in (*SECTIONS, "history"):
            data.setdefault(key, [])
        return data

    def save_data(self, data: Dict[str, Any]):
        """Escrita atômica para não corromper o arquivo."""
        temp_file = self.filepath + ".tmp"
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(temp_file, self.filepath)

    def get_backpack(self) -> Dict[str, Any]:
        data = self.load_data()
        result = {key: data.get(key, []) for key in SECTIONS}
        result["total_items"] = sum(len(result[key]) for key in SECTIONS)
        return result

    # ------------------------------------------------------------------
    # Desfazer
    # ------------------------------------------------------------------
    def _push_snapshot(self, data: Dict[str, Any], action_type: str, description: str):
        """Registra o estado ANTERIOR à alteração dentro do mesmo objeto que será salvo."""
        history = data.setdefault("history", [])
        history.append({
            "action_type": action_type,
            "description": description,
            "timestamp": _now(),
            "snapshot": {key: copy.deepcopy(data.get(key, [])) for key in SECTIONS},
        })
        del history[:-MAX_HISTORY]

    def undo_last_action(self) -> Dict[str, Any]:
        data = self.load_data()
        history = data.get("history", [])
        if not history:
            return {"success": False, "message": "Não há nenhuma ação para desfazer."}

        last = history.pop()
        for key in SECTIONS:
            data[key] = last.get("snapshot", {}).get(key, [])
        self.save_data(data)
        return {
            "success": True,
            "message": f"Desfeito: {last.get('description', 'última alteração')}",
            "reverted_action": last.get("action_type"),
        }

    # ------------------------------------------------------------------
    # Escrita (usada pelas ferramentas)
    # ------------------------------------------------------------------
    def save_table_row(self, table_name: str, columns_data: Dict[str, Any], action_summary: str = "") -> Dict[str, Any]:
        data = self.load_data()
        self._push_snapshot(data, "tabela", f"linha adicionada em '{table_name}'")
        tables = data["tables"]

        table = next((t for t in tables if t["name"].strip().lower() == table_name.strip().lower()), None)
        is_new = table is None
        if is_new:
            table = {
                "id": _new_id("tab"),
                "name": table_name.strip(),
                "columns": list(columns_data.keys()),
                "rows": [],
                "created_at": _now(),
            }
            tables.append(table)

        for col in columns_data.keys():
            if col not in table["columns"]:
                table["columns"].append(col)
        table["rows"].append(columns_data)
        table["updated_at"] = _now()

        self.save_data(data)
        return {
            "table_name": table["name"],
            "table_id": table["id"],
            "is_new": is_new,
            "total_rows": len(table["rows"]),
            "row_added": columns_data,
            "summary": action_summary or f"Linha registrada em '{table['name']}'",
        }

    def save_flashcards(self, theme: str, cards: List[Dict[str, str]]) -> Dict[str, Any]:
        data = self.load_data()
        self._push_snapshot(data, "flashcard", f"baralho '{theme}'")
        decks = data["flashcards"]

        deck = next((d for d in decks if d["theme"].strip().lower() == theme.strip().lower()), None)
        is_new = deck is None
        if is_new:
            deck = {"id": _new_id("deck"), "theme": theme.strip(), "cards": [], "created_at": _now()}
            decks.append(deck)

        start = len(deck["cards"]) + 1
        for offset, c in enumerate(cards):
            deck["cards"].append({
                "id": start + offset,
                "question": str(c.get("pergunta") or c.get("question") or "").strip(),
                "answer": str(c.get("resposta") or c.get("answer") or "").strip(),
                "mastered": False,
            })
        deck["updated_at"] = _now()

        self.save_data(data)
        return {
            "theme": deck["theme"],
            "deck_id": deck["id"],
            "total_cards": len(deck["cards"]),
            "cards_added": len(cards),
            "is_new": is_new,
        }

    def save_appointment(self, title: str, date: str, time_str: str, category: str = "Geral") -> Dict[str, Any]:
        data = self.load_data()
        self._push_snapshot(data, "agenda", f"compromisso '{title}'")
        event = {
            "id": _new_id("evt"),
            "title": title.strip(),
            "date": date.strip(),
            "time": time_str.strip(),
            "category": (category or "Geral").strip() or "Geral",
            "completed": False,
            "created_at": _now(),
        }
        data["agenda"].append(event)
        self.save_data(data)
        return {"event": event, "total_events": len(data["agenda"])}

    def save_summary(self, subject: str, points: List[str]) -> Dict[str, Any]:
        data = self.load_data()
        self._push_snapshot(data, "resumo", f"resumo '{subject}'")
        summary = {
            "id": _new_id("sum"),
            "title": subject.strip(),
            "points": [str(p).strip() for p in points if str(p).strip()],
            "created_at": _now(),
        }
        data["summaries"].append(summary)
        self.save_data(data)
        return {"summary": summary, "total_summaries": len(data["summaries"])}

    # ------------------------------------------------------------------
    # Exclusão (botões 🗑️ da Mochila)
    # ------------------------------------------------------------------
    def _delete_from(self, section: str, item_id: str, label_key: str, action: str, noun: str) -> Dict[str, Any]:
        data = self.load_data()
        items = data[section]
        idx = next((i for i, it in enumerate(items) if it.get("id") == item_id), None)
        if idx is None:
            return {"success": False, "message": f"{noun} não encontrado(a)."}
        label = items[idx].get(label_key, "")
        self._push_snapshot(data, action, f"exclusão de {noun.lower()} '{label}'")
        items.pop(idx)
        self.save_data(data)
        return {"success": True, "message": f"{noun} '{label}' excluído(a)."}

    def delete_table(self, table_id: str) -> Dict[str, Any]:
        return self._delete_from("tables", table_id, "name", "tabela", "Tabela")

    def delete_flashcard_deck(self, deck_id: str) -> Dict[str, Any]:
        return self._delete_from("flashcards", deck_id, "theme", "flashcard", "Baralho")

    def delete_appointment(self, event_id: str) -> Dict[str, Any]:
        return self._delete_from("agenda", event_id, "title", "agenda", "Compromisso")

    def delete_summary(self, summary_id: str) -> Dict[str, Any]:
        return self._delete_from("summaries", summary_id, "title", "resumo", "Resumo")

    def delete_table_row(self, table_id: str, row_index: int) -> Dict[str, Any]:
        data = self.load_data()
        table = next((t for t in data["tables"] if t.get("id") == table_id), None)
        if not table or not (0 <= row_index < len(table.get("rows", []))):
            return {"success": False, "message": "Linha não encontrada."}
        self._push_snapshot(data, "tabela", f"exclusão de linha em '{table.get('name')}'")
        table["rows"].pop(row_index)
        table["updated_at"] = _now()
        self.save_data(data)
        return {"success": True, "message": "Linha excluída."}

    def toggle_appointment(self, event_id: str) -> Dict[str, Any]:
        data = self.load_data()
        evt = next((e for e in data["agenda"] if e.get("id") == event_id), None)
        if not evt:
            return {"success": False, "message": "Compromisso não encontrado."}
        evt["completed"] = not evt.get("completed", False)
        self.save_data(data)
        return {"success": True, "message": "Compromisso atualizado.", "completed": evt["completed"]}


# Instância Singleton
db = BackpackDB()
