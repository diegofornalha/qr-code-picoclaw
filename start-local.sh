#!/bin/bash

echo "
██████╗ ██╗███████╗██████╗  █████╗ ██████╗  █████╗ ██████╗  ██████╗ ██████╗ 
██╔══██╗██║██╔════╝██╔══██╗██╔══██╗██╔══██╗██╔══██╗██╔══██╗██╔═══██╗██╔══██╗
██║  ██║██║███████╗██████╔╝███████║██████╔╝███████║██║  ██║██║   ██║██████╔╝
██║  ██║██║╚════██║██╔═══╝ ██╔══██║██╔══██╗██╔══██║██║  ██║██║   ██║██╔══██╗
██████╔╝██║███████║██║     ██║  ██║██║  ██║██║  ██║██████╔╝╚██████╔╝██║  ██║
╚═════╝ ╚═╝╚══════╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝  ╚═════╝ ╚═╝  ╚═╝

██╗      ██████╗  ██████╗ █████╗ ██╗     
██║     ██╔═══██╗██╔════╝██╔══██╗██║     
██║     ██║   ██║██║     ███████║██║     
██║     ██║   ██║██║     ██╔══██║██║     
███████╗╚██████╔╝╚██████╗██║  ██║███████╗
╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝
"

echo "================================================"
echo "🚀 Inicialização Local do Disparador WhatsApp"
echo "================================================"

# Verificar se o arquivo .env existe
if [ ! -f .env ]; then
    echo "⚠️  Arquivo .env não encontrado. Criando a partir das variáveis de ambiente..."
    
    # Criar arquivo .env com valores padrão se não existirem
    cat > .env << EOF
NEXT_PUBLIC_EVOLUTION_URL=${NEXT_PUBLIC_EVOLUTION_URL:-http://localhost:8080}
NEXT_PUBLIC_EVOLUTION_API=${NEXT_PUBLIC_EVOLUTION_API:-your_api_key_here}
NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL:-http://localhost:3000}
NEXT_PUBLIC_AUTH_USERNAME=${AUTH_USERNAME:-admin}
NEXT_PUBLIC_AUTH_PASSWORD=${AUTH_PASSWORD:-admin}
AUTH_SECRET_KEY=${AUTH_SECRET_KEY:-secret_key_change_this}
NEXT_PUBLIC_CHATWOOT_INTEGRATION=${NEXT_PUBLIC_CHATWOOT_INTEGRATION:-false}
NEXT_PUBLIC_CHATWOOT_DOMAIN=${NEXT_PUBLIC_CHATWOOT_DOMAIN:-}
NEXT_PUBLIC_CHATWOOT_ACCOUNT_ID=${NEXT_PUBLIC_CHATWOOT_ACCOUNT_ID:-}
NEXT_PUBLIC_CHATWOOT_TOKEN=${NEXT_PUBLIC_CHATWOOT_TOKEN:-}
NEXT_PUBLIC_CHATWOOT_DATABASE_CONNECTION_URI=${NEXT_PUBLIC_CHATWOOT_DATABASE_CONNECTION_URI:-}
NEXT_PUBLIC_AUTO_FILL_DDI=${NEXT_PUBLIC_AUTO_FILL_DDI:-true}
NEXT_PUBLIC_DEFAULT_LOCATION=${NEXT_PUBLIC_DEFAULT_LOCATION:-BR}
EOF
    echo "✅ Arquivo .env criado!"
else
    echo "✅ Arquivo .env encontrado!"
fi

# Carregar variáveis do .env
export $(grep -v '^#' .env | xargs)

echo ""
echo "🔧 Configurações do Ambiente:"
echo "------------------------------------------------"
echo "📡 API URL: $NEXT_PUBLIC_EVOLUTION_URL"
echo "🔑 API Key: ${NEXT_PUBLIC_EVOLUTION_API:0:8}..."
echo "🌐 App URL: $NEXT_PUBLIC_APP_URL"
echo "🔒 Node Environment: ${NODE_ENV:-development}"
echo "🌍 Porta: 3000"
echo "================================================"

# Verificar se o Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não está instalado. Por favor, instale o Node.js primeiro."
    exit 1
fi

echo ""
echo "📦 Versão do Node.js: $(node -v)"
echo "📦 Versão do npm: $(npm -v)"

# Verificar se node_modules existe
if [ ! -d "node_modules" ]; then
    echo ""
    echo "📦 Instalando dependências..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Falha ao instalar dependências"
        exit 1
    fi
fi

# Criar diretório de uploads se não existir
echo ""
echo "📁 Criando diretório de uploads..."
mkdir -p public/uploads
chmod -R 755 public/uploads

# Testar conexão com a API
echo ""
echo "🔍 Testando conexão com a API..."
API_RESPONSE=$(curl -s "$NEXT_PUBLIC_EVOLUTION_URL" 2>/dev/null || echo "failed")

if [ "$API_RESPONSE" != "failed" ]; then
    API_STATUS=$(echo "$API_RESPONSE" | grep -o '"status":[0-9]*' | cut -d':' -f2)
    API_VERSION=$(echo "$API_RESPONSE" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
    
    if [ -n "$API_STATUS" ] && [ "$API_STATUS" = "200" ]; then
        echo "✅ API respondeu com sucesso (HTTP 200)"
        [ -n "$API_VERSION" ] && echo "📦 Versão da API: $API_VERSION"
    else
        echo "⚠️  API está acessível mas retornou status: ${API_STATUS:-desconhecido}"
    fi
else
    echo "⚠️  Não foi possível conectar à API em $NEXT_PUBLIC_EVOLUTION_URL"
    echo "   Certifique-se de que a Evolution API está rodando."
fi

# Verificar modo de execução
echo ""
echo "================================================"
echo "Escolha o modo de execução:"
echo "1) Desenvolvimento (com hot-reload)"
echo "2) Produção (build + start)"
echo "================================================"
read -p "Digite sua escolha (1 ou 2): " choice

case $choice in
    1)
        echo ""
        echo "🚀 Iniciando em modo DESENVOLVIMENTO..."
        echo "✨ Hot-reload ativado - alterações serão aplicadas automaticamente"
        echo ""
        echo "🌐 Acesse em: http://localhost:3000"
        echo "================================================"
        echo ""
        npm run dev
        ;;
    2)
        echo ""
        echo "🏗️  Fazendo build da aplicação..."
        npm run build
        if [ $? -ne 0 ]; then
            echo "❌ Falha no build da aplicação"
            exit 1
        fi
        
        echo ""
        echo "✅ Build concluído com sucesso!"
        echo ""
        echo "🚀 Iniciando em modo PRODUÇÃO..."
        echo ""
        echo "🌐 Acesse em: http://localhost:3000"
        echo "================================================"
        echo ""
        npm start
        ;;
    *)
        echo "❌ Opção inválida. Saindo..."
        exit 1
        ;;
esac