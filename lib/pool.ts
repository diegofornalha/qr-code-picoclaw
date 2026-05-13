export interface SlotInfo {
  number: number
  name: string // "whatsapp_1", "whatsapp_2", etc.
  status: 'disconnected' | 'pairing' | 'connected'
}

export interface PoolState {
  slots: SlotInfo[]
}

export interface PoolQREvent {
  slot_number: number
  slot_name: string
  event: string // "code", "success", "disconnected", "error"
  code: string  // QR data (only for "code" event)
}
