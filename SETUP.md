# QR Code PicoClaw - Setup

## Como funciona

App Next.js que gera QR Code do WhatsApp via `picoclaw channels login --channel whatsapp` direto no navegador, sem precisar do terminal.

Ao escanear o QR, a app automaticamente reinicia o gateway do PicoClaw para ativar o canal.

**Importante:** Esse app so precisa ser ativado uma vez, no momento de vincular o WhatsApp. Depois que o QR for escaneado e o canal estiver ativo, o servidor pode ser desligado. So precisa rodar novamente caso desconecte o WhatsApp e precise vincular de novo.

## Configuracao

### .env

```
NEXT_PUBLIC_APP_URL=http://0.0.0.0:3001
PORT=3001
WACLI_STORE=/root/.picoclaw/credentials/whatsapp/default
WACLI_PATH=/root/.local/bin/wacli
```

### Dependencias

- `wacli` copiado para `/root/.local/bin/wacli`
- Symlink: `/root/.wacli` -> `/root/.picoclaw/credentials/whatsapp/default`
- PicoClaw configurado em `/root/.picoclaw/picoclaw.json`

## Rodar local (apenas localhost)

```bash
cd /root/qr-code-picoclaw
npx next dev -p 3001
```

Acesso: `http://localhost:3001/`

## Rodar com IP publico

A diferenca e usar `-H 0.0.0.0` para escutar em todas as interfaces de rede:

```bash
cd /root/qr-code-picoclaw
npx next dev -p 3001 -H 0.0.0.0
```

Acesso externo: `http://177.23.145.146:3001/`

### O que muda

| Flag | Escuta em | Acesso |
|------|-----------|--------|
| (sem flag) | `127.0.0.1` | Apenas local |
| `-H 0.0.0.0` | Todas interfaces | Local + rede + IP publico |

## Desativar acesso pelo IP publico

Parar o servidor e reiniciar sem a flag `-H 0.0.0.0`:

```bash
# Matar o servidor atual
pkill -f "next dev"

# Reiniciar apenas local
cd /root/qr-code-picoclaw
npx next dev -p 3001
```

Agora so funciona em `http://localhost:3001/`, sem acesso externo.

## Script rapido para conectar WhatsApp

```bash
./connect-whatsapp.sh
```

Faz: login (QR) -> reinicia gateway -> mostra status.

## Fluxo da app web

1. Acessa a pagina e clica em "Conectar WhatsApp"
2. Aparece painel de logs em tempo real + QR Code
3. Escaneia o QR pelo WhatsApp > Aparelhos conectados
4. App detecta conexao, reinicia o gateway automaticamente
5. Canal fica ativo em `http://127.0.0.1:18789/?token=<token>`
