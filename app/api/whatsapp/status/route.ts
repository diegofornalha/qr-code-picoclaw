import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const res = await fetch('http://127.0.0.1:18790/health', {
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return NextResponse.json({ connected: false })
    const data = await res.json()
    return NextResponse.json({ connected: data?.status === 'ok' })
  } catch {
    return NextResponse.json({ connected: false })
  }
}
