import { NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { readdirSync } from 'fs'
import path from 'path'

const execFileAsync = promisify(execFile)
const WACLI_BIN = process.env.WACLI_PATH || '/root/.local/bin/wacli'
const STORE_BASE = process.env.WACLI_STORE_BASE || process.env.WACLI_STORE || '/root/.picoclaw/credentials/whatsapp/default'
const MAX_SLOTS = parseInt(process.env.WHATSAPP_POOL_MAX_SLOTS || '10', 10)

export const dynamic = 'force-dynamic'

function storeConnStr(slotPath: string): string {
  return `file:${path.join(slotPath, 'store.db')}?_foreign_keys=on`
}

async function checkSlotConnected(storePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(WACLI_BIN, ['auth', 'status'], {
      timeout: 5000,
      env: { ...process.env, WACLI_STORE_PATH: storeConnStr(storePath) },
    })
    return /logged in|authenticated|connected/i.test(stdout) && !/not authenticated/i.test(stdout)
  } catch {
    return false
  }
}

function getSlotPhone(storePath: string): string | null {
  const dbFile = path.join(storePath, 'store.db')
  if (!existsSync(dbFile)) return null
  try {
    const { execFileSync } = require('child_process')
    const out = execFileSync('sqlite3', [dbFile, 'SELECT jid FROM whatsmeow_device LIMIT 1;'], {
      timeout: 2000, encoding: 'utf8',
    }).trim()
    if (!out) return null
    // jid format: 5521999999999:NN@s.whatsapp.net → +55 21 99999-9999
    const num = out.split(':')[0]
    if (!num || num.length < 8) return null
    return '+' + num
  } catch {
    return null
  }
}

function discoverSlots(): number[] {
  const slots: number[] = []
  try {
    const entries = readdirSync(STORE_BASE, { withFileTypes: true })
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const n = parseInt(e.name, 10)
      if (isNaN(n) || n <= 0) continue
      slots.push(n)
    }
  } catch {
    // directory doesn't exist yet
  }
  slots.sort((a, b) => a - b)
  return slots
}

export async function GET() {
  const existingSlots = discoverSlots()

  // Always ensure at least slot 1 exists in the response
  if (existingSlots.length === 0) {
    existingSlots.push(1)
  }

  // Only return slots that actually have a store.db
  const slotsWithStore = existingSlots.filter(n =>
    existsSync(path.join(STORE_BASE, String(n), 'store.db'))
  )

  const slots = await Promise.all(
    slotsWithStore.map(async (n) => {
      const storePath = path.join(STORE_BASE, String(n))
      const connected = await checkSlotConnected(storePath)
      const phone = getSlotPhone(storePath)
      return {
        number: n,
        name: `whatsapp_${n}`,
        status: connected ? 'connected' : 'disconnected',
        phone: phone,
      }
    })
  )

  // Next available slot number for the frontend
  const maxExisting = slotsWithStore.length > 0 ? Math.max(...slotsWithStore) : 0
  const nextSlot = maxExisting + 1

  return NextResponse.json({ slots, next_slot: nextSlot <= MAX_SLOTS ? nextSlot : null })
}
