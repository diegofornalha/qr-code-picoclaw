import { NextResponse } from 'next/server'
import { rm } from 'fs/promises'
import { join } from 'path'

export async function POST() {
  try {
    const home = process.env.HOME || '/root'
    // Remove WhatsApp session store to force re-login with QR code
    const storePath = join(home, '.picoclaw', 'workspace', 'whatsapp', 'store.db')
    await rm(storePath, { force: true })

    // Also try legacy credentials path
    const credsDir = join(home, '.picoclaw', 'credentials', 'whatsapp', 'default')
    await rm(credsDir, { recursive: true, force: true }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
