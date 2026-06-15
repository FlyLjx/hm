const ANNOUNCEMENT_RECEIPTS_KEY = 'ai-pi-announcement-receipts'

export function localReceipts() {
  try {
    const raw = localStorage.getItem(ANNOUNCEMENT_RECEIPTS_KEY)
    const value = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(value) ? value.map(String) : [])
  } catch {
    return new Set()
  }
}

export function receiptKey(announcement) {
  if (!announcement) return ''
  return `${announcement.id}:${announcement.updatedAt || announcement.createdAt || ''}`
}

export function saveReceipt(announcement) {
  const key = typeof announcement === 'string' ? announcement : receiptKey(announcement)
  if (!key) return
  const receipts = localReceipts()
  receipts.add(key)
  localStorage.setItem(ANNOUNCEMENT_RECEIPTS_KEY, JSON.stringify([...receipts]))
}
