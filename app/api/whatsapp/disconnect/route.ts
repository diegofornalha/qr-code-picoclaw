import { NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const WACLI_BIN = process.env.WACLI_PATH || '/root/.local/bin/wacli'

export async function POST() {
  try {
    await execFileAsync(WACLI_BIN, ['auth', 'logout'], { timeout: 10000 })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
