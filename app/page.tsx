'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Smartphone, RefreshCw, CheckCircle, XCircle, Wifi, WifiOff, QrCode, Trash2, AlertTriangle } from 'lucide-react'

interface SlotInfo {
  number: number
  name: string
  status: 'disconnected' | 'pairing' | 'connected'
  phone?: string | null
}

type PageStatus = 'loading' | 'pool' | 'legacy'

export default function QRCodePage() {
  const [pageStatus, setPageStatus] = useState<PageStatus>('loading')
  const [slots, setSlots] = useState<SlotInfo[]>([])
  const [nextSlot, setNextSlot] = useState<number | null>(1)
  const [pairingSlot, setPairingSlot] = useState<number | null>(null)
  const [qrCode, setQrCode] = useState('')
  const [message, setMessage] = useState('')
  const [logs, setLogs] = useState<string[]>([])
  const [justConnected, setJustConnected] = useState<number | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const logsEndRef = useRef<HTMLDivElement | null>(null)

  // Legacy single-slot state
  const [legacyStatus, setLegacyStatus] = useState<'checking' | 'connected' | 'disconnected' | 'connecting' | 'error'>('checking')
  const [legacyQR, setLegacyQR] = useState('')
  const [legacyMessage, setLegacyMessage] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const slotsRef = useRef<SlotInfo[]>([]) // mirror of slots for polling callback

  // Keep slotsRef in sync
  useEffect(() => { slotsRef.current = slots }, [slots])

  useEffect(() => {
    loadPoolStatus()
    return () => {
      eventSourceRef.current?.close()
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // ──── POOL MODE ────

  const loadPoolStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/pool/status')
      if (res.ok) {
        const data = await res.json()
        const fetchedSlots: SlotInfo[] = data.slots || []
        setSlots(fetchedSlots)
        setNextSlot(data.next_slot ?? null)
        setPageStatus('pool')

        // Start polling for disconnect detection (every 15s)
        if (!pollRef.current) {
          pollRef.current = setInterval(pollForDisconnects, 15000)
        }
      } else {
        setPageStatus('legacy')
        checkLegacyStatus()
      }
    } catch {
      setPageStatus('legacy')
      checkLegacyStatus()
    }
  }

  const startSlotPairing = (slotNum: number) => {
    eventSourceRef.current?.close()
    setPairingSlot(slotNum)
    setQrCode('')
    setLogs([])
    setMessage(`Preparando Slot ${slotNum}...`)

    // Mark as pairing in slots
    setSlots(prev => prev.map(s =>
      s.number === slotNum ? { ...s, status: 'pairing' } : s
    ))

    const es = new EventSource(`/api/whatsapp/pool/qr?slot=${slotNum}`)
    eventSourceRef.current = es

    es.addEventListener('code', (e) => {
      const data = JSON.parse(e.data)
      setQrCode(data.code)
      setMessage(`Slot ${slotNum} disponivel - escaneie o QR abaixo`)
    })

    es.addEventListener('log', (e) => {
      const data = JSON.parse(e.data)
      setLogs(prev => [...prev.slice(-30), data.text])
    })

    es.addEventListener('connected', () => {
      es.close()
      setQrCode('')
      setPairingSlot(null)
      setJustConnected(slotNum)
      setMessage(`Slot ${slotNum} conectado!`)

      setSlots(prev => prev.map(s =>
        s.number === slotNum ? { ...s, status: 'connected' } : s
      ))

      // Just clear the animation after 3s, don't auto-advance
      setTimeout(async () => {
        setJustConnected(null)
        setMessage('')
        await refreshPoolStatus()
      }, 3000)
    })

    es.addEventListener('error', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        setLogs(prev => [...prev.slice(-30), `Erro: ${data.message}`])
      } catch {
        // SSE connection error - try to reconnect
      }
    })

    es.addEventListener('done', () => {
      es.close()
      setPairingSlot(null)
      setQrCode('')
      refreshPoolStatus()
    })

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) return
      es.close()
      setMessage(`Erro na conexao do Slot ${slotNum}`)
    }
  }

  const pollForDisconnects = async () => {
    try {
      const res = await fetch('/api/whatsapp/pool/status')
      if (!res.ok) return
      const data = await res.json()
      const freshSlots: SlotInfo[] = data.slots || []
      const prevSlots = slotsRef.current

      // Detect slots that were connected but are now disconnected
      const newlyDisconnected: number[] = []
      for (const fresh of freshSlots) {
        const prev = prevSlots.find(s => s.number === fresh.number)
        if (prev && prev.status === 'connected' && fresh.status === 'disconnected') {
          newlyDisconnected.push(fresh.number)
        }
      }

      setSlots(freshSlots)

      if (newlyDisconnected.length > 0) {
        const slotNums = newlyDisconnected.join(', ')
        setMessage(`Slot ${slotNums} desconectou! Reconectando...`)

        // If we're not already pairing something, start pairing the first disconnected
        const currentlyPairing = freshSlots.find(s => s.status === 'pairing')
        if (!currentlyPairing) {
          const toPair = freshSlots.find(s => s.status === 'disconnected')
          if (toPair) {
            startSlotPairing(toPair.number)
          }
        }
      }
    } catch { /* ignore polling errors */ }
  }

  const refreshPoolStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/pool/status')
      if (res.ok) {
        const data = await res.json()
        setSlots(data.slots || [])
        setNextSlot(data.next_slot ?? null)
      }
    } catch { /* ignore */ }
  }

  // ──── LEGACY MODE ────

  const checkLegacyStatus = async () => {
    setLegacyStatus('checking')
    try {
      const res = await fetch('/api/whatsapp/status')
      const data = await res.json()
      if (data.connected) {
        setLegacyStatus('connected')
        setLegacyMessage('WhatsApp conectado')
      } else {
        startLegacyConnection()
      }
    } catch {
      startLegacyConnection()
    }
  }

  const startLegacyConnection = () => {
    eventSourceRef.current?.close()
    setLegacyStatus('connecting')
    setLegacyQR('')
    setLogs([])
    setLegacyMessage('Gerando QR Code...')

    const es = new EventSource('/api/whatsapp/connect')
    eventSourceRef.current = es

    es.addEventListener('log', (e) => {
      const data = JSON.parse(e.data)
      setLogs(prev => [...prev.slice(-50), data.text])
    })
    es.addEventListener('qr', (e) => {
      const data = JSON.parse(e.data)
      setLegacyQR(data.qr)
      setLegacyMessage('QR Code pronto! Escaneie com seu WhatsApp')
    })
    es.addEventListener('connected', (e) => {
      const data = JSON.parse(e.data)
      setLegacyStatus('connected')
      setLegacyQR('')
      setLegacyMessage(data.message || 'WhatsApp conectado!')
      es.close()
    })
    es.addEventListener('error', () => { setLegacyStatus('error'); setLegacyMessage('Erro na conexao'); es.close() })
    es.addEventListener('done', () => { es.close(); setLegacyStatus('disconnected') })
    es.onerror = () => { if (es.readyState === EventSource.CLOSED) return; setLegacyStatus('error'); es.close() }
  }

  // ──── DELETE ────

  const deleteSlot = async (slotNum: number) => {
    setDeleting(true)
    try {
      await fetch(`/api/whatsapp/pool/delete?slot=${slotNum}`, { method: 'POST' })
      setShowDeleteModal(false)
      setSelectedSlot(null)
      // If we were pairing this slot, stop
      if (pairingSlot === slotNum) {
        eventSourceRef.current?.close()
        setPairingSlot(null)
        setQrCode('')
      }
      setMessage(`Slot ${slotNum} removido`)
      await refreshPoolStatus()
    } catch {
      setMessage('Erro ao remover slot')
    }
    setDeleting(false)
  }

  const deleteAllSlots = async () => {
    setDeleting(true)
    try {
      eventSourceRef.current?.close()
      setPairingSlot(null)
      setQrCode('')
      await fetch('/api/whatsapp/pool/delete?slot=all', { method: 'POST' })
      setShowDeleteModal(false)
      setSelectedSlot(null)
      setSlots([])
      setMessage('Todos os slots removidos. Recarregando...')
      // Reload status to get fresh slot 1
      setTimeout(() => loadPoolStatus(), 1500)
    } catch {
      setMessage('Erro ao limpar slots')
    }
    setDeleting(false)
  }

  // ──── RENDER ────

  const connectedCount = slots.filter(s => s.status === 'connected').length

  if (pageStatus === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Loader2 className="h-12 w-12 animate-spin text-gray-400" />
      </div>
    )
  }

  // Legacy single-slot mode
  if (pageStatus === 'legacy') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-bold flex items-center gap-2">
                <Smartphone className="h-6 w-6" />
                Conectar WhatsApp
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center space-y-6">
                {legacyStatus === 'checking' && (
                  <div className="py-12">
                    <Loader2 className="h-12 w-12 animate-spin mx-auto text-gray-400" />
                    <p className="mt-4 text-gray-600">Verificando status...</p>
                  </div>
                )}
                {legacyStatus === 'connected' && (
                  <div className="py-12">
                    <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
                    <p className="mt-4 text-lg font-medium text-green-600">{legacyMessage}</p>
                  </div>
                )}
                {legacyStatus === 'disconnected' && (
                  <div className="py-12">
                    <XCircle className="h-16 w-16 text-gray-400 mx-auto" />
                    <Button onClick={startLegacyConnection} className="mt-6">
                      <Smartphone className="mr-2 h-4 w-4" />
                      Conectar WhatsApp
                    </Button>
                  </div>
                )}
                {legacyStatus === 'connecting' && (
                  <div className="py-6">
                    {!legacyQR ? (
                      <div className="py-8">
                        <Loader2 className="h-12 w-12 animate-spin mx-auto text-gray-400" />
                        <p className="mt-4 text-gray-600">Gerando QR Code...</p>
                      </div>
                    ) : (
                      <div>
                        <div className="inline-block bg-white p-6 rounded-xl shadow-lg">
                          <pre style={{ fontFamily: "'Courier New', monospace", fontSize: '6px', lineHeight: '6.5px', letterSpacing: '1px', whiteSpace: 'pre', color: '#000' }}>
                            {legacyQR}
                          </pre>
                        </div>
                        <p className="mt-4 text-sm text-gray-500">
                          Abra o WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {legacyStatus === 'error' && (
                  <div className="py-12">
                    <XCircle className="h-16 w-16 text-red-400 mx-auto" />
                    <p className="mt-4 text-red-600">{legacyMessage}</p>
                    <Button onClick={startLegacyConnection} className="mt-6">Tentar Novamente</Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // ──── POOL UI ────
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl space-y-4">
        {/* Slot Badges */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-2xl font-bold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="h-6 w-6" />
                WhatsApp Pool
              </div>
              <span className="text-sm font-normal text-gray-500">
                {connectedCount}/{slots.length} conectados
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {slots.length === 0 ? (
              <div className="text-center py-6 text-gray-500">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                Aguardando slots...
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-3">
                  {slots.map((slot) => (
                    <button
                      key={slot.number}
                      onClick={() => { setSelectedSlot(slot.number); setShowDeleteModal(true) }}
                      className={`
                        flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all cursor-pointer
                        hover:ring-2 hover:ring-gray-300
                        ${slot.status === 'connected'
                          ? justConnected === slot.number
                            ? 'bg-green-100 text-green-700 ring-2 ring-green-400 animate-pulse'
                            : 'bg-green-100 text-green-700'
                          : slot.status === 'pairing'
                            ? 'bg-yellow-100 text-yellow-700 animate-pulse'
                            : 'bg-red-100 text-red-700'
                        }
                      `}
                    >
                      {slot.status === 'connected' ? (
                        <Wifi className="h-4 w-4" />
                      ) : slot.status === 'pairing' ? (
                        <QrCode className="h-4 w-4" />
                      ) : (
                        <WifiOff className="h-4 w-4" />
                      )}
                      <span>Slot {slot.number}</span>
                      {slot.phone && (
                        <span className="text-xs opacity-70">{slot.phone}</span>
                      )}
                    </button>
                  ))}
                </div>
                {slots.length > 1 && (
                  <div className="mt-3 pt-3 border-t">
                    <Button
                      onClick={() => { setSelectedSlot(null); setShowDeleteModal(true) }}
                      variant="outline"
                      size="sm"
                      className="text-red-500 border-red-200 hover:bg-red-50"
                    >
                      <Trash2 className="mr-2 h-3 w-3" />
                      Limpar tudo e recomecar
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* QR Code / Status Area */}
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              {/* Just connected animation */}
              {justConnected && !qrCode && (
                <div className="py-8">
                  <CheckCircle className="h-16 w-16 text-green-500 mx-auto animate-bounce" />
                  <p className="mt-4 text-lg font-medium text-green-600">{message}</p>
                  <p className="mt-1 text-sm text-gray-400">Preparando proximo slot...</p>
                </div>
              )}

              {/* QR Code display */}
              {qrCode && pairingSlot && (
                <div>
                  <p className="text-lg font-medium text-gray-700 mb-2">
                    Slot {pairingSlot} disponivel
                  </p>
                  <p className="text-sm text-gray-500 mb-4">
                    Escaneie o QR abaixo com seu WhatsApp
                  </p>
                  <div className="inline-block bg-white p-6 rounded-xl shadow-lg">
                    <pre
                      style={{
                        fontFamily: "'Courier New', monospace",
                        fontSize: '6px',
                        lineHeight: '6.5px',
                        letterSpacing: '1px',
                        whiteSpace: 'pre',
                        color: '#000',
                      }}
                    >
                      {qrCode}
                    </pre>
                  </div>
                  <p className="mt-4 text-sm text-gray-500">
                    Abra o WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho
                  </p>
                  <div className="mt-3">
                    <Button onClick={() => startSlotPairing(pairingSlot)} variant="outline" size="sm">
                      <RefreshCw className="mr-2 h-3 w-3" />
                      Gerar Novo QR
                    </Button>
                  </div>
                </div>
              )}

              {/* Waiting for QR */}
              {!qrCode && !justConnected && pairingSlot && (
                <div className="py-8">
                  <Loader2 className="h-12 w-12 animate-spin mx-auto text-gray-400" />
                  <p className="mt-4 text-gray-600">{message || `Gerando QR para Slot ${pairingSlot}...`}</p>
                </div>
              )}

              {/* Idle - no pairing in progress */}
              {!qrCode && !justConnected && !pairingSlot && (
                <div className="py-8">
                  {connectedCount > 0 && (
                    <>
                      <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
                      <p className="mt-4 text-lg font-medium text-green-600">
                        {connectedCount} slot{connectedCount > 1 ? 's' : ''} conectado{connectedCount > 1 ? 's' : ''}
                      </p>
                    </>
                  )}
                  {slots.length === 0 && (
                    <p className="text-gray-500">Nenhum slot configurado</p>
                  )}
                  <div className="mt-6 flex gap-3 justify-center flex-wrap">
                    {nextSlot && (
                      <Button
                        onClick={() => startSlotPairing(nextSlot)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <QrCode className="mr-2 h-4 w-4" />
                        Gerar novo slot
                      </Button>
                    )}
                    <Button onClick={refreshPoolStatus} variant="outline" size="sm">
                      <RefreshCw className="mr-2 h-3 w-3" />
                      Atualizar status
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Logs */}
        {logs.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <div className="max-h-32 overflow-y-auto text-xs text-gray-400 space-y-0.5">
                {logs.map((log, i) => (
                  <p key={i}>{log}</p>
                ))}
                <div ref={logsEndRef} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="h-8 w-8 text-red-500 flex-shrink-0" />
              <h3 className="text-lg font-bold">
                {selectedSlot ? `Remover Slot ${selectedSlot}` : 'Limpar todos os slots'}
              </h3>
            </div>
            <div className="space-y-3 text-sm text-gray-600">
              {selectedSlot ? (
                <>
                  <p>Isso vai desconectar e remover o <strong>Slot {selectedSlot}</strong>.</p>
                  <p>O dispositivo sera desvinculado e o store.db sera apagado.</p>
                </>
              ) : (
                <>
                  <p>Isso vai <strong>remover todos os slots</strong> e recomecar do zero.</p>
                  <p>Todos os dispositivos vinculados serao desconectados.</p>
                </>
              )}
            </div>
            <div className="mt-6 flex gap-3 justify-end">
              <Button
                onClick={() => { setShowDeleteModal(false); setSelectedSlot(null) }}
                variant="outline"
                disabled={deleting}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => selectedSlot ? deleteSlot(selectedSlot) : deleteAllSlots()}
                className="bg-red-500 hover:bg-red-600 text-white"
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                {selectedSlot ? 'Remover slot' : 'Limpar tudo'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
