'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Smartphone, RefreshCw, CheckCircle, XCircle, LogOut, Trash2, AlertTriangle } from 'lucide-react'

type Status = 'idle' | 'checking' | 'connected' | 'disconnected' | 'connecting' | 'error'

export default function QRCodePage() {
  const [status, setStatus] = useState<Status>('checking')
  const [qrCode, setQrCode] = useState('')
  const [message, setMessage] = useState('')
  const [logs, setLogs] = useState<string[]>([])
  const [qrReady, setQrReady] = useState(false)
  const [showCleanModal, setShowCleanModal] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const logsEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    checkStatus()
    return () => {
      eventSourceRef.current?.close()
    }
  }, [])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const checkStatus = async () => {
    setStatus('checking')
    try {
      const res = await fetch('/api/whatsapp/status')
      const data = await res.json()
      if (data.connected) {
        setStatus('connected')
        setMessage('WhatsApp conectado')
      } else {
        // Auto-start connection instead of showing "disconnected" button
        startConnection()
      }
    } catch {
      startConnection()
    }
  }

  const startConnection = () => {
    eventSourceRef.current?.close()
    setStatus('connecting')
    setQrCode('')
    setQrReady(false)
    setLogs([])
    setMessage('Gerando QR Code...')

    const es = new EventSource('/api/whatsapp/connect')
    eventSourceRef.current = es

    es.addEventListener('log', (e) => {
      const data = JSON.parse(e.data)
      setLogs((prev) => [...prev.slice(-50), data.text])
    })

    es.addEventListener('qr', (e) => {
      const data = JSON.parse(e.data)
      setQrCode(data.qr)
      setQrReady(true)
      setMessage('QR Code pronto! Escaneie com seu WhatsApp')
    })

    es.addEventListener('connected', (e) => {
      const data = JSON.parse(e.data)
      // Keep QR visible briefly if it was showing
      const delay = qrReady ? 3000 : 0
      setTimeout(() => {
        setStatus('connected')
        setQrCode('')
        setQrReady(false)
        setMessage(data.message || 'WhatsApp conectado com sucesso!')
        es.close()
      }, delay)
    })

    es.addEventListener('error', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        setMessage(data.message || 'Erro na conexao')
      } catch {
        setMessage('Conexao com servidor perdida')
      }
      setStatus('error')
      es.close()
    })

    es.addEventListener('done', () => {
      checkStatus()
      es.close()
    })

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) return
      setStatus('error')
      setMessage('Conexao com servidor perdida')
      es.close()
    }
  }

  const disconnect = async () => {
    setStatus('checking')
    setMessage('Desconectando...')
    try {
      await fetch('/api/whatsapp/disconnect', { method: 'POST' })
      setStatus('disconnected')
      setQrCode('')
      setMessage('Desconectado')
    } catch {
      setMessage('Erro ao desconectar')
      setStatus('error')
    }
  }

  const cleanCredentials = async () => {
    setShowCleanModal(false)
    setStatus('checking')
    setMessage('Limpando credenciais...')
    try {
      await fetch('/api/whatsapp/disconnect', { method: 'POST' })
      setStatus('disconnected')
      setQrCode('')
      setMessage('Credenciais removidas. Clique em Conectar para gerar novo QR.')
    } catch {
      setMessage('Erro ao limpar credenciais')
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-bold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="h-6 w-6" />
                Conectar WhatsApp
              </div>
              {qrReady && (
                <span className="text-sm font-medium text-green-500 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  QR Code pronto
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center space-y-6">
              {status === 'checking' && (
                <div className="py-12">
                  <Loader2 className="h-12 w-12 animate-spin mx-auto text-gray-400" />
                  <p className="mt-4 text-gray-600">Verificando status...</p>
                </div>
              )}

              {status === 'connected' && (
                <div className="py-12">
                  <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
                  <p className="mt-4 text-lg font-medium text-green-600">{message}</p>
                  <div className="mt-6 flex gap-3 justify-center">
                    <Button onClick={disconnect} variant="outline" className="text-red-500 border-red-300 hover:bg-red-50">
                      <LogOut className="mr-2 h-4 w-4" />
                      Desconectar
                    </Button>
                    <Button onClick={() => setShowCleanModal(true)} variant="outline" className="text-orange-500 border-orange-300 hover:bg-orange-50">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Limpar credenciais
                    </Button>
                  </div>
                </div>
              )}

              {status === 'disconnected' && (
                <div className="py-12">
                  <XCircle className="h-16 w-16 text-gray-400 mx-auto" />
                  <p className="mt-4 text-gray-600">WhatsApp desconectado</p>
                  <Button onClick={startConnection} className="mt-6">
                    <Smartphone className="mr-2 h-4 w-4" />
                    Conectar WhatsApp
                  </Button>
                </div>
              )}

              {status === 'connecting' && (
                <div className="py-6">
                  {!qrCode && (
                    <div className="py-8 text-center">
                      <Loader2 className="h-12 w-12 animate-spin mx-auto text-gray-400" />
                      <p className="mt-4 text-gray-600">Iniciando gateway...</p>
                      <p className="mt-1 text-sm text-gray-400">O QR code aparece em alguns segundos</p>
                      {logs.map((log, i) => (
                        <p key={i} className="text-xs text-gray-400 mt-1">{log}</p>
                      ))}
                    </div>
                  )}
                  {qrCode && (
                    <div className="text-center">
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
                      <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 max-w-md mx-auto">
                        <p>Apos escanear, verifique no celular em <strong>Dispositivos vinculados</strong> se o PicoClaw aparece como <strong>"Ativo"</strong>.</p>
                      </div>
                      <div className="mt-3 flex gap-3 justify-center">
                        <Button onClick={startConnection} variant="outline">
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Gerar Novo QR
                        </Button>
                        <Button onClick={() => { setStatus('connected'); setQrCode(''); setQrReady(false); setMessage('WhatsApp conectado!'); eventSourceRef.current?.close(); }} className="bg-green-600 hover:bg-green-700 text-white">
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Esta ativo, confirmar
                        </Button>
                      </div>
                    </div>
                  )}
                  <div ref={logsEndRef} />
                </div>
              )}

              {status === 'error' && (
                <div className="py-12">
                  <XCircle className="h-16 w-16 text-red-400 mx-auto" />
                  <p className="mt-4 text-red-600">{message}</p>
                  <div className="mt-6 flex gap-3 justify-center">
                    <Button onClick={startConnection}>
                      Tentar Novamente
                    </Button>
                    <Button onClick={checkStatus} variant="outline">
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Verificar Status
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {showCleanModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="h-8 w-8 text-orange-500 flex-shrink-0" />
              <h3 className="text-lg font-bold">Limpar credenciais</h3>
            </div>
            <div className="space-y-3 text-sm text-gray-600">
              <p>Isso vai remover as credenciais salvas do WhatsApp no servidor.</p>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="font-medium text-orange-700">Antes de continuar:</p>
                <p className="mt-1 text-orange-600">
                  Va no celular em <strong>WhatsApp &gt; Configuracoes &gt; Dispositivos vinculados</strong> e desconecte o PicoClaw. Caso contrario, o dispositivo pode ficar em estado inconsistente.
                </p>
              </div>
              <p>Apos limpar, voce precisara escanear um novo QR code para reconectar.</p>
            </div>
            <div className="mt-6 flex gap-3 justify-end">
              <Button onClick={() => setShowCleanModal(false)} variant="outline">
                Cancelar
              </Button>
              <Button onClick={cleanCredentials} className="bg-orange-500 hover:bg-orange-600 text-white">
                <Trash2 className="mr-2 h-4 w-4" />
                Ja desvinculei, limpar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
