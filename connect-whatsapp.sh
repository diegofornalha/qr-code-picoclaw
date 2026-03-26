#!/bin/bash
# Conecta WhatsApp via PicoClaw e reinicia o gateway

echo "🔗 Conectando WhatsApp..."

# Limpa lock se existir
rm -f ~/.picoclaw/credentials/whatsapp/default/LOCK 2>/dev/null

# Login (gera QR code)
cd /Users/2a/.claude/batalha/picoclaw && ./build/picoclaw-darwin-arm64 channels login --channel whatsapp

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ WhatsApp vinculado! Reiniciando gateway..."
  picoclaw gateway restart
  sleep 5
  echo ""
  picoclaw channels status
else
  echo ""
  echo "❌ Falha ao conectar WhatsApp"
  exit 1
fi
