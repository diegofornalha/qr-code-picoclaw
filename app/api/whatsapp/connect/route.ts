import { spawn } from 'child_process'

const WACLI_BIN = process.env.WACLI_PATH || '/root/.local/bin/wacli'

export const dynamic = 'force-dynamic'

export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      function send(event: string, data: any) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      // Kill any existing wacli auth process
      try { require('child_process').execSync('pkill -f "wacli auth$" 2>/dev/null || true') } catch {}

      const proc = spawn(WACLI_BIN, ['auth'], {
        env: { ...process.env },
      })

      let qrLines: string[] = []
      let capturing = false
      let qrFlushTimer: ReturnType<typeof setTimeout> | null = null
      let qrSent = false

      function flushQr() {
        if (qrLines.length > 5) {
          send('qr', { qr: qrLines.join('\n') })
          qrSent = true
        }
        qrLines = []
        capturing = false
      }

      function processLine(line: string) {
        const clean = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '').trim()
        if (!clean) return

        // Auth start
        if (/Starting authentication/i.test(clean)) {
          send('log', { text: 'Gerando QR Code...' })
          return
        }

        // Scan instruction line — start capturing QR after this
        if (/Scan this QR/i.test(clean)) {
          capturing = true
          qrLines = []
          return
        }

        // QR code lines (block characters)
        if (capturing) {
          const hasBlock = /[█▄▀▌▐]/.test(clean)
          if (hasBlock) {
            qrLines.push(clean)
            if (qrFlushTimer) clearTimeout(qrFlushTimer)
            qrFlushTimer = setTimeout(flushQr, 1500)
            return
          } else {
            if (qrFlushTimer) clearTimeout(qrFlushTimer)
            flushQr()
          }
        }

        // Success
        if (/logged in|authenticated|connected|syncing|paired/i.test(clean)) {
          send('connected', { message: 'WhatsApp conectado com sucesso!' })
          return
        }

        // Any other text line
        if (clean.length > 0 && !qrSent) {
          send('log', { text: clean })
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
