import { NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { rmSync, existsSync } from 'fs'
import path from 'path'

const execFileAsync = promisify(execFile)
const WACLI_BIN = process.env.WACLI_PATH || '/root/.local/bin/wacli'
const STORE_BASE = process.env.WACLI_STORE_BASE || process.env.WACLI_STORE || '/root/.picoclaw/credentials/whatsapp/default'

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const slotParam = searchParams.get('slot')

  // Delete all slots
  if (slotParam === 'all') {
    try {
      const { readdirSync } = require('fs')
      const entries = readdirSync(STORE_BASE, { withFileTypes: true })
      let deleted = 0
      for (const e of entries) {
        if (!e.isDirectory()) continue
        const n = parseInt(e.name, 10)
        if (isNaN(n) || n <= 0) continue
        const slotDir = path.join(STORE_BASE, e.name)
        const connStr = `file:${path.join(slotDir, 'store.db')}?_foreign_keys=on`
        // Try logout first
        try {
          await execFileAsync(WACLI_BIN, ['auth', 'logout'], {
            timeout: 5000,
            env: { ...process.env, WACLI_STORE_PATH: connStr },
          })
        } catch { /* ignore */ }
        // Delete the directory
        rmSync(slotDir, { recursive: true, force: true })
        deleted++
      }
      return NextResponse.json({ success: true, deleted })
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: 500 })
    }
  }

  // Delete single slot
  const slotNum = parseInt(slotParam || '', 10)
  if (isNaN(slotNum) || slotNum <= 0) {
    return NextResponse.json({ error: 'Invalid slot number' }, { status: 400 })
  }

  const slotDir = path.join(STORE_BASE, String(slotNum))
  const connStr = `file:${path.join(slotDir, 'store.db')}?_foreign_keys=on`

  try {
    // Try logout first
    if (existsSync(path.join(slotDir, 'store.db'))) {
      try {
        await execFileAsync(WACLI_BIN, ['auth', 'logout'], {
          timeout: 5000,
          env: { ...process.env, WACLI_STORE_PATH: connStr },
        })
      } catch { /* ignore logout errors */ }
    }

    // Delete the slot directory
    if (existsSync(slotDir)) {
      rmSync(slotDir, { recursive: true, force: true })
    }

    return NextResponse.json({ success: true, slot: slotNum })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
