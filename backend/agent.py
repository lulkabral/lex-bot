"""
Cérebro do Lex — Agente com Groq SDK usando EXCLUSIVAMENTE `openai/gpt-oss-120b`.

- Tool Calling em loop (o modelo pode encadear várias ferramentas na mesma frase).
- Os resultados das ferramentas voltam para o modelo, que redige a resposta final.
- Memória: últimas 10 mensagens do chat + contexto real da Mochila no system prompt.
- Sem dados mockados: se a Groq falhar, o Lex avisa o usuário em vez de inventar conteúdo.
"""

import os
import json
from datetime import datetime
from typing import Dict, Any, List, Optional

# Carrega .env exclusivamente da pasta backend
ENV_PATH = os.path.join(os.path.dirname(__file__), ".env")
try:
    from dotenv import load_dotenv
    if os.path.exists(ENV_PATH):
        load_dotenv(ENV_PATH, override=True)
except ImportError:
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ[k.strip()] = v.strip()

from database import db
from tools import AVAILABLE_TOOLS

# ============================================================================
# Configuração do modelo (único modelo permitido)
# ============================================================================
MODEL = "openai/gpt-oss-120b"
MAX_COMPLETION_TOKENS = 4096   # inclui tokens de raciocínio do gpt-oss
REASONING_EFFORT = "medium"
TEMPERATURE = 0.6
MAX_TOOL_ROUNDS = 4
HISTORY_WINDOW = 10
PLACEHOLDER_KEYS = {"", "sua_chave_aqui", "coloque_sua_chave_aqui"}

WEEKDAYS_PT = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"]

# ============================================================================
# Schema das ferramentas (Function Calling)
# ============================================================================
GROQ_TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "gerenciar_tabela_dinamica",
            "description": (
                "Cria uma tabela ou adiciona UMA linha em uma tabela da Mochila do usuário "
                "(ex: gastos, vendas, aulas, encomendas, tarefas). Use os valores EXATOS ditos pelo usuário."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "nome_tabela": {
                        "type": "string",
                        "description": "Nome da tabela. Reutilize o nome exato de uma tabela existente quando fizer sentido."
                    },
                    "colunas_dados": {
                        "type": "object",
                        "description": (
                            "Objeto coluna->valor da nova linha, com os dados reais do pedido. "
                            "Ex: {\"Data\": \"27/10/2026\", \"Descrição\": \"Gasolina\", \"Categoria\": \"Transporte\", "
                            "\"Valor (R$)\": \"65,00\", \"Tipo\": \"Despesa\"}. Se a tabela já existe, use as mesmas colunas dela."
                        ),
                        "additionalProperties": {"type": "string"}
                    },
                    "resumo_acao": {
                        "type": "string",
                        "description": "Frase curta descrevendo o que foi registrado."
                    }
                },
                "required": ["nome_tabela", "colunas_dados"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "criar_flashcards_estudo",
            "description": (
                "Cria (ou amplia) um baralho de flashcards sobre o tema EXATO pedido pelo usuário. "
                "Gere perguntas e respostas corretas, didáticas e específicas daquele assunto."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "tema": {
                        "type": "string",
                        "description": "Tema do baralho, fiel ao pedido (ex: 'Química Orgânica', 'Biologia Celular')."
                    },
                    "lista_perguntas_respostas": {
                        "type": "array",
                        "description": "Entre 6 e 12 cartões, salvo se o usuário pedir outra quantidade.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "pergunta": {"type": "string", "description": "Pergunta objetiva."},
                                "resposta": {"type": "string", "description": "Resposta correta e explicativa (1 a 3 frases)."}
                            },
                            "required": ["pergunta", "resposta"]
                        }
                    }
                },
                "required": ["tema", "lista_perguntas_respostas"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "agendar_compromisso",
            "description": "Salva um compromisso, aula, tarefa com prazo ou lembrete na agenda do usuário.",
            "parameters": {
                "type": "object",
                "properties": {
                    "titulo": {"type": "string", "description": "O que vai acontecer, com as palavras do usuário."},
                    "data": {"type": "string", "description": "Data absoluta no formato AAAA-MM-DD (resolva 'amanhã', 'sexta' etc. a partir da data de hoje)."},
                    "horario": {"type": "string", "description": "Horário no formato HH:MM (24h)."},
                    "categoria": {"type": "string", "description": "Ex: Trabalho, Saúde, Estudos, Pessoal."}
                },
                "required": ["titulo", "data", "horario"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "pesquisar_e_resumir",
            "description": "Cria um resumo estruturado, guia prático ou checklist na Mochila sobre o assunto pedido.",
            "parameters": {
                "type": "object",
                "properties": {
                    "assunto": {"type": "string", "description": "Título do resumo, fiel ao pedido."},
                    "pontos_principais": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "De 4 a 8 pontos claros, em linguagem simples e corretos."
                    }
                },
                "required": ["assunto", "pontos_principais"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "pedir_esclarecimento",
            "description": (
                "Use SOMENTE quando faltar um dado indispensável que não dá para deduzir "
                "(ex: valor de um gasto não informado, horário de um compromisso)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "pergunta_amigavel": {"type": "string", "description": "Pergunta curta e gentil sobre o dado que faltou."}
                },
                "required": ["pergunta_amigavel"]
            }
        }
    }
]

BASE_SYSTEM_PROMPT = """Você é o Lex, uma raposa amigável e competente: o agente pessoal de IA de pessoas comuns (estudantes, autônomos, professores, profissionais liberais).

COMO VOCÊ TRABALHA
- O usuário só conversa. Você usa o seu "Computador" (as ferramentas) nos bastidores para criar tabelas, flashcards, agenda e resumos na Mochila dele.
- Fale em português do Brasil, com calor humano e objetividade. Nunca use jargões como LLM, API, JSON, prompt, endpoint ou "ferramenta".

REGRAS DE OURO
1. Fidelidade total ao pedido: use o TEMA, os VALORES, as DATAS e as DESCRIÇÕES exatamente como o usuário disse. Nunca troque o assunto nem invente valores.
2. Flashcards: gere conteúdo real, correto e específico do tema pedido (6 a 12 cartões, ou a quantidade pedida).
3. Gastos/receitas/tarefas: registre os dados exatos em uma tabela. Se a data não foi dita, use a data de hoje. Se o VALOR de um gasto não foi dito, peça esclarecimento.
4. Compromissos: converta datas relativas ("amanhã", "sexta") em AAAA-MM-DD a partir da data de hoje. Se faltar o horário, peça esclarecimento.
5. Pode usar várias ferramentas na mesma resposta quando o usuário pedir várias coisas.
6. Conversa comum ou perguntas sobre o que já está salvo: responda direto, sem ferramentas, usando o contexto da Mochila abaixo.
7. Depois de usar ferramentas, responda em 1 a 3 frases curtas confirmando o que foi feito (não repita o conteúdo inteiro dos cartões ou resumos).
"""


def _today_context() -> str:
    now = datetime.now()
    return f"Hoje é {WEEKDAYS_PT[now.weekday()]}, {now.strftime('%d/%m/%Y')} ({now.strftime('%Y-%m-%d')}), {now.strftime('%H:%M')}."


def build_system_prompt() -> str:
    """Monta o system prompt com a data atual e um resumo leve da Mochila."""
    backpack = db.get_backpack()

    def fmt(items: List[str], empty: str) -> str:
        return "\n".join(items) if items else empty

    tables = fmt(
        [f"- '{t.get('name')}' — {len(t.get('rows', []))} linhas — colunas: {', '.join(t.get('columns', []))}"
         for t in backpack.get("tables", [])],
        "- (nenhuma tabela)"
    )
    decks = fmt(
        [f"- '{d.get('theme')}' — {len(d.get('cards', []))} cartões" for d in backpack.get("flashcards", [])],
        "- (nenhum baralho)"
    )
    agenda = fmt(
        [f"- '{a.get('title')}' — {a.get('date')} às {a.get('time')} ({a.get('category', 'Geral')})"
         for a in backpack.get("agenda", [])],
        "- (agenda vazia)"
    )
    summaries = fmt([f"- '{s.get('title')}'" for s in backpack.get("summaries", [])], "- (nenhum resumo)")

    return f"""{BASE_SYSTEM_PROMPT}
DATA ATUAL: {_today_context()}

MOCHILA ATUAL DO USUÁRIO
[Tabelas]
{tables}
[Baralhos de Flashcards]
{decks}
[Agenda]
{agenda}
[Resumos]
{summaries}
"""


# ============================================================================
# Normalização de argumentos vindos do modelo
# ============================================================================
def _maybe_json(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return value
    return value


def _normalize_args(name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    if name == "gerenciar_tabela_dinamica":
        cols = _maybe_json(args.get("colunas_dados", {}))
        if not isinstance(cols, dict):
            cols = {"Descrição": str(cols)}
        args["colunas_dados"] = {str(k): "" if v is None else str(v) for k, v in cols.items()}
    elif name == "criar_flashcards_estudo":
        cards = _maybe_json(args.get("lista_perguntas_respostas", []))
        args["lista_perguntas_respostas"] = cards if isinstance(cards, list) else []
    elif name == "pesquisar_e_resumir":
        points = _maybe_json(args.get("pontos_principais", []))
        if isinstance(points, str):
            points = [p.strip("-• ").strip() for p in points.split("\n") if p.strip()]
        args["pontos_principais"] = [str(p) for p in points] if isinstance(points, list) else []
    return args


class LexAgent:
    def __init__(self):
        self.model = MODEL
        self.active_model = MODEL
        self.client = None
        self.api_key = os.getenv("GROQ_API_KEY", "").strip()
        if self.api_key not in PLACEHOLDER_KEYS:
            try:
                from groq import Groq
                self.client = Groq(api_key=self.api_key)
            except Exception as e:
                print(f"[LexAgent] Erro ao instanciar Groq SDK: {e}")
                self.client = None

    # ------------------------------------------------------------------
    # API pública
    # ------------------------------------------------------------------
    def process_message(
        self,
        user_text: str,
        image_data: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        if not self.client:
            return self._reply(
                "Ainda não consigo ligar meu computador: falta configurar a chave da Groq no arquivo backend/.env "
                "(GROQ_API_KEY). Assim que ela estiver lá, é só reiniciar o servidor!",
                state="confused"
            )

        text = (user_text or "").strip()
        if image_data:
            text = (
                f"{text or 'Enviei uma foto.'}\n\n"
                "[Observação do sistema: o usuário anexou uma foto, mas você ainda não consegue enxergar imagens. "
                "Avise com gentileza e peça para ele descrever o conteúdo em texto.]"
            )

        try:
            return self._run_agent(text, history or [])
        except Exception as err:
            print(f"[LexAgent] Erro na Groq ({self.model}): {err}")
            return self._reply(
                "Ops, meu computador travou por um instante e não consegui concluir. "
                "Nada foi salvo na sua Mochila. Pode tentar de novo?",
                state="confused",
                steps=["Falha de comunicacao com o servidor de IA. Nenhuma alteracao foi feita."]
            )

    # ------------------------------------------------------------------
    # Núcleo do agente
    # ------------------------------------------------------------------
    def _create_completion(self, messages: List[Dict[str, Any]]):
        """Chamada única ao gpt-oss-120b com parâmetros compatíveis (max_completion_tokens)."""
        params = dict(
            model=self.model,
            messages=messages,
            tools=GROQ_TOOLS_SCHEMA,
            tool_choice="auto",
            temperature=TEMPERATURE,
            top_p=1,
            max_completion_tokens=MAX_COMPLETION_TOKENS,
            reasoning_effort=REASONING_EFFORT,
            stream=False,
        )
        try:
            return self.client.chat.completions.create(**params)
        except Exception as first_err:
            # Uma nova tentativa cobre falhas transitórias de geração de tool call (tool_use_failed)
            print(f"[LexAgent] Tentando novamente após erro: {first_err}")
            return self.client.chat.completions.create(**params)

    def _run_agent(self, prompt: str, history: List[Dict[str, str]]) -> Dict[str, Any]:
        messages: List[Dict[str, Any]] = [{"role": "system", "content": build_system_prompt()}]
        for msg in history[-HISTORY_WINDOW:]:
            role, content = msg.get("role"), msg.get("content")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": str(content)})
        messages.append({"role": "user", "content": prompt})

        steps: List[str] = []
        cards: List[Dict[str, Any]] = []
        tools_run: List[str] = []
        final_text = ""
        clarification = None

        for _ in range(MAX_TOOL_ROUNDS):
            response = self._create_completion(messages)
            message = response.choices[0].message
            tool_calls = message.tool_calls or []

            if not tool_calls:
                final_text = (message.content or "").strip()
                break

            messages.append({
                "role": "assistant",
                "content": message.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments or "{}"}
                    }
                    for tc in tool_calls
                ]
            })

            for tc in tool_calls:
                name = tc.function.name
                result = self._execute_tool(name, tc.function.arguments)
                tools_run.append(name)
                steps.extend(result.get("computer_steps", []))
                if result.get("confirmation_card"):
                    cards.append(result["confirmation_card"])
                if name == "pedir_esclarecimento" and result.get("status") != "error":
                    clarification = result.get("message")

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(
                        {"status": result.get("status"), "resultado": result.get("data"), "erro": result.get("error")},
                        ensure_ascii=False,
                        default=str
                    )
                })

            if clarification:
                break

        if clarification:
            return self._reply(clarification, state="confused", steps=steps, tools=tools_run)

        if not final_text:
            final_text = " ".join(c.get("title", "") for c in cards).strip() or "Prontinho!"

        return self._reply(final_text, state="success" if cards else "idle", steps=steps, cards=cards, tools=tools_run)

    def _execute_tool(self, name: str, raw_args: Optional[str]) -> Dict[str, Any]:
        func = AVAILABLE_TOOLS.get(name)
        if not func:
            return {"status": "error", "error": f"Ferramenta desconhecida: {name}", "computer_steps": []}
        try:
            args = json.loads(raw_args) if raw_args else {}
            if not isinstance(args, dict):
                raise ValueError("argumentos inválidos")
            return func(**_normalize_args(name, args))
        except Exception as e:
            print(f"[LexAgent] Erro executando {name}: {e}")
            return {
                "status": "error",
                "error": f"Não foi possível executar {name}: {e}",
                "computer_steps": [f"Nao foi possivel concluir a etapa ({name})."]
            }

    @staticmethod
    def _reply(
        message: str,
        state: str = "idle",
        steps: Optional[List[str]] = None,
        cards: Optional[List[Dict[str, Any]]] = None,
        tools: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        cards = cards or []
        tools = tools or []
        return {
            "message": message,
            "state": state,
            "computer_steps": steps or [],
            "confirmation_card": cards[-1] if cards else None,
            "confirmation_cards": cards,
            "tool_executed": tools[-1] if tools else None,
            "tools_executed": tools,
        }


# Instância Global
agent = LexAgent()
