import { NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const WACLI_BIN = process.env.WACLI_PATH || '/root/.local/bin/wacli'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { stdout } = await execFileAsync(WACLI_BIN, ['auth', 'status'], {
      timeout: 5000,
    })
    const connected = /logged in|authenticated|connected/i.test(stdout) && !/not authenticated/i.test(stdout)
    return NextResponse.json({ connected })
  } catch {
    return NextResponse.json({ connected: false })
  }
}
