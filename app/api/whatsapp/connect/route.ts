import { spawn } from 'child_process'
import { readFile } from 'fs/promises'
import { join } from 'path'

const PICOCLAW_BIN = process.env.PICOCLAW_BIN || '/Users/2a/.claude/batalha/picoclaw/build/picoclaw-darwin-arm64'

async function getLinkedNumber(): Promise<string | null> {
  try {
    const home = process.env.HOME || '/root'
    const credsPath = join(home, '.picoclaw', 'credentials', 'whatsapp', 'default', 'creds.json')
    const creds = JSON.parse(await readFile(credsPath, 'utf-8'))
    const jid = creds?.me?.id
    if (!jid) return null
    return '+' + jid.split(':')[0]
  } catch { return null }
}

export const dynamic = 'force-dynamic'

export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      function send(event: string, data: any) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      // Kill existing gateway
      try { require('child_process').execSync('pkill -f "picoclaw-darwin-arm64 gateway" 2>/dev/null || true') } catch {}

      const proc = spawn(PICOCLAW_BIN, ['gateway'], {
        env: { ...process.env, HOME: process.env.HOME || '/root' },
      })

      let qrLines: string[] = []
      let capturing = false
      let sent = false
      let bannerDone = false
      let qrFlushTimer: ReturnType<typeof setTimeout> | null = null

      function flushQr() {
        if (qrLines.length > 10) {
          send('qr', { qr: qrLines.join('\n') })
          sent = true
        }
        qrLines = []
        capturing = false
      }

      function processLine(line: string) {
        const clean = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '').trim()
        if (!clean) return

        // Skip ASCII banner
        if (/[╗╔═║╚╝]/.test(clean)) return

        // Wait for gateway ready
        if (!bannerDone) {
          if (/Gateway started/i.test(clean)) {
            bannerDone = true
            send('log', { text: 'Gateway iniciado. Aguardando QR code...' })
          }
          return
        }

        // QR detection
        const hasBlock = /[▄▀█▌▐]/.test(clean)
        const hasText = /[a-zA-Z0-9:✓•📦⚡🦞]/.test(clean)
        const isQr = clean.length > 15 && hasBlock && !hasText

        if (!capturing && isQr) {
          capturing = true
          qrLines = [clean]
          // Flush after 2s of silence (gateway stops printing after QR)
          if (qrFlushTimer) clearTimeout(qrFlushTimer)
          qrFlushTimer = setTimeout(flushQr, 2000)
          return
        }

        if (capturing) {
          if (isQr) {
            qrLines.push(clean)
            // Reset flush timer
            if (qrFlushTimer) clearTimeout(qrFlushTimer)
            qrFlushTimer = setTimeout(flushQr, 2000)
          } else {
            if (qrFlushTimer) clearTimeout(qrFlushTimer)
            flushQr()
          }
          if (capturing) return
        }

        // Connection success
        if (/linked|logged in|successfully|paired|authenticated|syncing|sync complete|bootstrap/i.test(clean)) {
          send('connected', { message: 'Vinculado! WhatsApp conectado.' })
          ;(async () => {
            const phone = await getLinkedNumber()
            if (phone) send('log', { text: `Numero: ${phone}` })
          })()
        }
      }

      let buffer = ''
      function onData(chunk: Buffer) {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) processLine(line)
      }

      proc.stdout.on('data', onData)
      proc.stderr.on('data', onData)

      proc.on('close', (code) => {
        if (capturing) flushQr()
        send('done', { code })
        controller.close()
      })

      proc.on('error', (err) => {
        send('error', { message: err.message })
        controller.close()
      })

      const timeout = setTimeout(() => proc.kill('SIGTERM'), 5 * 60 * 1000)
      proc.on('close', () => clearTimeout(timeout))
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}
