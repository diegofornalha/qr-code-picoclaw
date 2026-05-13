import { spawn } from 'child_process'
import path from 'path'

const WACLI_BIN = process.env.WACLI_PATH || '/root/.local/bin/wacli'
const STORE_BASE = process.env.WACLI_STORE_BASE || process.env.WACLI_STORE || '/root/.picoclaw/credentials/whatsapp/default'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const slotNum = parseInt(searchParams.get('slot') || '1', 10)
  const slotName = `whatsapp_${slotNum}`
  const slotDir = path.join(STORE_BASE, String(slotNum))
  const storeConnStr = `file:${path.join(slotDir, 'store.db')}?_foreign_keys=on`

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      function send(event: string, data: any) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      // Kill any existing wacli auth for this slot
      try { require('child_process').execSync(`pkill -f "wacli auth$" 2>/dev/null || true`) } catch {}

      // Ensure slot directory exists
      try { require('fs').mkdirSync(slotDir, { recursive: true }) } catch {}

      const proc = spawn(WACLI_BIN, ['auth'], {
        env: { ...process.env, WACLI_STORE_PATH: storeConnStr },
      })

      let qrLines: string[] = []
      let capturing = false
      let qrFlushTimer: ReturnType<typeof setTimeout> | null = null
      let qrSent = false

      function flushQr() {
        if (qrLines.length > 5) {
          send('code', {
            slot_number: slotNum,
            slot_name: slotName,
            event: 'code',
            code: qrLines.join('\n'),
          })
          qrSent = true
        }
        qrLines = []
        capturing = false
      }

      function processLine(line: string) {
        const clean = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '').trim()
        if (!clean) return

        if (/Starting authentication/i.test(clean)) {
          send('log', { slot_number: slotNum, slot_name: slotName, text: 'Gerando QR Code...' })
          return
        }

        if (/Scan this QR/i.test(clean)) {
          capturing = true
          qrLines = []
          return
        }

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

        if (/logged in|authenticated|connected|syncing|paired/i.test(clean)) {
          send('connected', {
            slot_number: slotNum,
            slot_name: slotName,
            event: 'success',
            message: `Slot ${slotNum} conectado com sucesso!`,
          })
          // Kill wacli immediately so it doesn't conflict with the gateway
          proc.kill('SIGTERM')
          return
        }

        if (clean.length > 0 && !qrSent) {
          send('log', { slot_number: slotNum, slot_name: slotName, text: clean })
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
        send('done', { slot_number: slotNum, slot_name: slotName, code })
        controller.close()
      })

      proc.on('error', (err) => {
        send('error', { slot_number: slotNum, slot_name: slotName, message: err.message })
        controller.close()
      })

      const timeout = setTimeout(() => proc.kill('SIGTERM'), 5 * 60 * 1000)
      proc.on('close', () => clearTimeout(timeout))
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
