"""
Ferramentas Universais do "Computador do Lex".
Executam as ações reais na Mochila do usuário (lex_backpack.json) usando
exatamente os dados enviados pelo modelo — nenhum conteúdo é inventado aqui.
Textos e status limpos sem emojis, com ícones vetoriais delegados à interface.
"""

from typing import Dict, Any, List
from database import db


def _error(tool: str, msg: str) -> Dict[str, Any]:
    return {
        "tool": tool,
        "status": "error",
        "error": msg,
        "computer_steps": [f"Erro: {msg}"],
        "confirmation_card": None,
        "data": None,
    }


def gerenciar_tabela_dinamica(nome_tabela: str, colunas_dados: Dict[str, Any], resumo_acao: str = "") -> Dict[str, Any]:
    """Cria uma tabela ou adiciona uma linha com os dados exatos do usuário."""
    nome_tabela = (nome_tabela or "").strip()
    if not nome_tabela or not colunas_dados:
        return _error("gerenciar_tabela_dinamica", "Faltaram o nome da tabela ou os dados da linha.")

    res = db.save_table_row(nome_tabela, colunas_dados, resumo_acao)
    preview = " · ".join(f"{k}: {v}" for k, v in list(colunas_dados.items())[:4])

    return {
        "tool": "gerenciar_tabela_dinamica",
        "status": "success",
        "computer_steps": [
            f"Abrindo a tabela '{res['table_name']}'" + (" (nova)" if res["is_new"] else ""),
            f"Preenchendo {len(colunas_dados)} colunas com os dados estruturados",
            f"Linha {res['total_rows']} registrada na Mochila",
        ],
        "confirmation_card": {
            "title": f"{'Tabela criada' if res['is_new'] else 'Tabela atualizada'}: {res['table_name']}",
            "detail": resumo_acao or preview,
            "badge": "Tabela Dinâmica",
            "backpack_tab": "tables",
            "target_id": res["table_id"],
        },
        "data": res,
    }


def criar_flashcards_estudo(tema: str, lista_perguntas_respostas: List[Dict[str, str]]) -> Dict[str, Any]:
    """Cria (ou amplia) um baralho com os cartões gerados pelo modelo para o tema pedido."""
    tema = (tema or "").strip()
    cards = [
        c for c in (lista_perguntas_respostas or [])
        if isinstance(c, dict) and (c.get("pergunta") or c.get("question")) and (c.get("resposta") or c.get("answer"))
    ]
    if not tema or not cards:
        return _error("criar_flashcards_estudo", "O baralho precisa de um tema e de pelo menos um cartão completo.")

    res = db.save_flashcards(tema, cards)

    return {
        "tool": "criar_flashcards_estudo",
        "status": "success",
        "computer_steps": [
            f"Analisando os conceitos-chave de '{res['theme']}'",
            f"Redigindo {res['cards_added']} cartões de pergunta e resposta",
            f"Baralho {'criado' if res['is_new'] else 'ampliado'} na Mochila ({res['total_cards']} cartões)",
        ],
        "confirmation_card": {
            "title": f"{'Baralho criado' if res['is_new'] else 'Baralho ampliado'}: {res['theme']}",
            "detail": f"{res['cards_added']} novos cartões · {res['total_cards']} no total",
            "badge": "Flashcards de Estudo",
            "backpack_tab": "flashcards",
            "target_id": res["deck_id"],
        },
        "data": res,
    }


def agendar_compromisso(titulo: str, data: str, horario: str, categoria: str = "Geral") -> Dict[str, Any]:
    """Salva um compromisso na agenda do usuário."""
    if not (titulo or "").strip() or not (data or "").strip() or not (horario or "").strip():
        return _error("agendar_compromisso", "Faltaram título, data ou horário do compromisso.")

    res = db.save_appointment(titulo, data, horario, categoria or "Geral")
    evt = res["event"]

    return {
        "tool": "agendar_compromisso",
        "status": "success",
        "computer_steps": [
            f"Verificando disponibilidade em {evt['date']} às {evt['time']}",
            f"Criando o compromisso '{evt['title']}' ({evt['category']})",
            "Compromisso registrado na Mochila",
        ],
        "confirmation_card": {
            "title": f"Agendado: {evt['title']}",
            "detail": f"{evt['date']} às {evt['time']} · {evt['category']}",
            "badge": "Agenda & Lembretes",
            "backpack_tab": "agenda",
            "target_id": evt["id"],
        },
        "data": res,
    }


def pesquisar_e_resumir(assunto: str, pontos_principais: List[str]) -> Dict[str, Any]:
    """Salva um resumo / checklist com os pontos escritos pelo modelo."""
    points = [p for p in (pontos_principais or []) if str(p).strip()]
    if not (assunto or "").strip() or not points:
        return _error("pesquisar_e_resumir", "O resumo precisa de um assunto e de pontos principais.")

    res = db.save_summary(assunto, points)
    summary = res["summary"]

    return {
        "tool": "pesquisar_e_resumir",
        "status": "success",
        "computer_steps": [
            f"Estruturando os tópicos principais sobre '{summary['title']}'",
            f"Sintetizando {len(summary['points'])} pontos objetivos",
            "Resumo organizado e salvo na Mochila",
        ],
        "confirmation_card": {
            "title": f"Resumo: {summary['title']}",
            "detail": f"{len(summary['points'])} tópicos organizados",
            "badge": "Resumo Estruturado",
            "backpack_tab": "summaries",
            "target_id": summary["id"],
        },
        "data": res,
    }


def pedir_esclarecimento(pergunta_amigavel: str) -> Dict[str, Any]:
    """Faltou um dado essencial: o Lex pergunta (estado 'confused')."""
    pergunta = (pergunta_amigavel or "").strip() or "Pode me fornecer mais um detalhe para que eu possa organizar isso?"
    return {
        "tool": "pedir_esclarecimento",
        "status": "clarification_needed",
        "computer_steps": ["Solicitando detalhe complementar para prosseguir"],
        "message": pergunta,
        "confirmation_card": None,
        "data": {"question": pergunta},
    }


AVAILABLE_TOOLS = {
    "gerenciar_tabela_dinamica": gerenciar_tabela_dinamica,
    "criar_flashcards_estudo": criar_flashcards_estudo,
    "agendar_compromisso": agendar_compromisso,
    "pesquisar_e_resumir": pesquisar_e_resumir,
    "pedir_esclarecimento": pedir_esclarecimento,
}
