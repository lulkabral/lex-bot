#!/usr/bin/env bash
# ==============================================================================
# Script de Inicialização Rápida do Lex — Consumer AI Agent
# ==============================================================================

set -e

cd "$(dirname "$0")"

echo "🦊 Iniciando o Lex..."

# Cria backend/.env se não existir
if [ ! -f "backend/.env" ]; then
    echo "⚙️ Criando backend/.env a partir de backend/.env.example..."
    cp backend/.env.example backend/.env
    echo "⚠️ Configure sua GROQ_API_KEY em backend/.env para ativar a IA!"
fi

# Ativa o ambiente virtual se existir
if [ -d ".venv" ]; then
    source .venv/bin/activate
fi

# Instala dependências se necessário
if ! python3 -c "import fastapi, uvicorn, groq" 2>/dev/null; then
    echo "📦 Instalando dependências..."
    pip install -r backend/requirements.txt
fi

echo "🚀 Servidor rodando em: http://localhost:8000"
echo "💡 Abra o navegador no link acima para interagir com o Lex!"
echo "------------------------------------------------------------------"

cd backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
