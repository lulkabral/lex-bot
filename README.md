# Lex — Consumer AI Agent (SaaS B2C)

<div align="center">

![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-openai%2Fgpt--oss--120b-F55036?style=for-the-badge&logo=groq&logoColor=white)
![Whisper](https://img.shields.io/badge/Whisper-large--v3--turbo-10A37F?style=for-the-badge&logo=openai&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)
![Theme](https://img.shields.io/badge/Theme-Pitch--Black_%26_Lex_Orange-08090A?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

<p align="center">
  <strong>Agente pessoal de inteligência artificial inspirado no Grok Bot (xAI), Rabbit R1 e Dot.</strong><br>
  Desenvolvido para pessoas fora da bolha tech: estudantes, autônomos, professores e profissionais liberais.
</p>

</div>

---

## Sobre o Produto

A maioria das pessoas não precisa lidar com a complexidade de engenharia de prompt, fórmulas avançadas de planilhas ou configurações de APIs. Com o **Lex**, o usuário se comunica por **texto**, **áudio** ou **envio de fotos**, e o agente executa tarefas reais de organização em segundo plano:

- **Tabelas financeiras e operacionais:** Criação e alimentação automática com colunas, valores, datas e categorias estruturadas.
- **Flashcards 3D interativos:** Geração de cartões de estudo para qualquer disciplina com mecânica de autoavaliação.
- **Agenda e lembretes:** Marcação de compromissos com interpretação de linguagem natural e datas relativas (ex: "amanhã às 15h", "sexta de manhã").
- **Resumos e checklists:** Síntese de tópicos em linguagem direta e organizada.
- **Mochila do Lex:** Painel lateral persistente onde todos os artefatos gerados ficam armazenados, com suporte a reversão de ações (Undo).

---

## Design System e Interface

Interface desenvolvida sob a estética **Pitch Black**, com paleta escura profunda, tipografia limpa e ícones vetoriais em SVG (sem uso de emojis na interface ou nos terminais de execução):

### 1. Barra Lateral de Navegação
- **Controles de janela macOS:** Três botões no topo com atalho para iniciar novas conversas.
- **Busca em tempo real:** Filtragem instantânea de conversas por título e conteúdo recente.
- **Histórico multi-conversas:** Sessões individuais com avatar em formato squircle, titulação automática pelo primeiro contexto, indicador de horário e opção de exclusão.
- **Menu da conta:** Indicador de uso semanal, instalador PWA (Desktop/iOS/Android), modal do plano Pro e atalhos de configurações.

### 2. Área Central de Conversa
- **Paleta de cores:** Fundo principal `#08090A`, superfícies `#101216` e `#14171E`, divisores sutis `#1A1D24` e acentos em Laranja Lex (`#FF4800` / `#FF5E1E`).
- **Compositor em pílula:** Campo de entrada com redimensionamento automático, botão de anexo para imagens, gravação de áudio com indicador de pulso e envio por tecla Enter.
- **Iconografia vetorial:** Todos os passos do Computador do Lex, badges de confirmação e ações utilizam SVGs dedicados.

### 3. Avatar Interativo
O avatar vetorial da raposa Lex responde dinamicamente às etapas de processamento:
- **Repouso (idle):** Respiração sutil contínua, piscar orgânico periódico dos olhos e inclinação de cabeça na passagem do cursor (hover).
- **Escuta (listening):** Anéis sonoros concêntricos ao redor da cabeça durante a captação de voz.
- **Processamento (thinking):** Auréola alaranjada pulsante, óculos de leitura sobrepostos e abertura do widget retrátil com as etapas da tarefa.
- **Conclusão (success):** Salto elástico suave e retorno sonoro discreto via Web Audio API.
- **Dúvida (confused):** Disparado quando faltam parâmetros essenciais para concluir a ação solicitada.

---

## Mochila do Lex (Workspace Lateral)

Gaveta lateral nativa construída com a tag `<dialog>`, oferecendo persistência para todos os dados criados pelo agente:

| Módulo | Funcionalidades |
|---|---|
| **Tabelas Dinâmicas** | Visualização em tabela escura, inserção de linhas, exclusão de itens e exportação direta para arquivo `.csv`. |
| **Flashcards 3D** | Giro tridimensional frente e verso, seletor de baralhos criados, controle de acertos/erros e navegação sequencial. |
| **Agenda** | Lista de compromissos com horário, data, tag de categoria e checkbox para conclusão de itens. |
| **Resumos** | Guias rápidos e checklists em formato de tópicos objetivos. |
| **Desfazer (Undo)** | Restauração atômica do estado anterior a partir de snapshots da Mochila. |

---

## Arquitetura de Inteligência Artificial

- **Modelo de linguagem:** `openai/gpt-oss-120b` executado sobre a infraestrutura da **Groq**.
  - Parâmetros: `max_completion_tokens=4096`, `reasoning_effort="medium"`.
  - **Tool Calling Multi-Rodada:** O modelo aciona ferramentas internas (`gerenciar_tabela_dinamica`, `criar_flashcards_estudo`, `agendar_compromisso`, `pesquisar_e_resumir`), processa os resultados do banco de dados e formula a resposta final com dados autênticos.
- **Reconhecimento de fala:** Transcrição via **Groq Whisper** (`whisper-large-v3-turbo`) a partir de áudios gravados no navegador via `MediaRecorder`.
- **Geração dinâmica:** Eliminação completa de templates fixos ou mocks estáticos; o conteúdo gerado responde estritamente ao tema solicitado.

---

## Estrutura do Repositório

```text
lex-bot/
├── backend/
│   ├── agent.py            # Orquestrador do agente Groq (openai/gpt-oss-120b)
│   ├── database.py         # Persistência em JSON da Mochila e histórico de Undo
│   ├── tools.py            # Definição e execução das ferramentas do agente
│   ├── main.py             # Servidor FastAPI com rotas de API e arquivos estáticos
│   ├── requirements.txt    # Dependências Python (FastAPI, uvicorn, groq, pydantic)
│   └── .env.example        # Modelo seguro de variáveis de ambiente
├── frontend/
│   ├── index.html          # Estrutura SPA com sidebar e componentes modais
│   ├── styles.css          # Design system Pitch Black, layout flex/grid e animações SVG
│   ├── app.js              # Controlador cliente, histórico de conversas e integração de áudio
│   ├── sw.js               # Service Worker para funcionalidade PWA
│   ├── manifest.json       # Manifesto PWA
│   └── icons/
│       ├── icon.svg        # Ícone da aplicação
│       └── lex-mark.svg    # Marca vetorial da raposa
├── .gitignore              # Bloqueio de arquivos locais, credenciais e caches
├── run.sh                  # Script de inicialização rápida
└── README.md               # Documentação técnica do projeto
```

---

## Como Executar Localmente

### Pré-requisitos
- Python 3.10 ou superior instalado.
- Chave de API da Groq ([console.groq.com/keys](https://console.groq.com/keys)).

### 1. Clonar o Repositório
```bash
git clone https://github.com/lulkabral/lex-bot.git
cd lex-bot
```

### 2. Configurar Variáveis de Ambiente
Copie o modelo de configuração e adicione sua chave:
```bash
cp backend/.env.example backend/.env
```
No arquivo `backend/.env`:
```env
GROQ_API_KEY=sua_chave_aqui
PORT=8000
```

### 3. Iniciar o Servidor

#### Inicialização Automática
```bash
chmod +x run.sh
./run.sh
```

#### Inicialização Manual
```bash
# 1. Criar e ativar o ambiente virtual
python3 -m venv .venv
source .venv/bin/activate  # No Windows: .venv\Scripts\activate

# 2. Instalar dependências
pip install -r backend/requirements.txt

# 3. Executar com uvicorn
cd backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Acesso
Abra no navegador: **[http://localhost:8000](http://localhost:8000)**

---

## Licença

Distribuído sob a licença **MIT**. Consulte o arquivo de licença para mais informações.
