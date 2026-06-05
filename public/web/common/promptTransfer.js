const PROMPT_TRANSFER_KEY = 'aipi-prompt-transfer'

export function saveTransferredPrompt(input) {
  sessionStorage.setItem(PROMPT_TRANSFER_KEY, JSON.stringify({ ...input, createdAt: Date.now() }))
}

export function readTransferredPrompt() {
  try {
    const raw = sessionStorage.getItem(PROMPT_TRANSFER_KEY)
    if (!raw) return null
    sessionStorage.removeItem(PROMPT_TRANSFER_KEY)
    const parsed = JSON.parse(raw)
    return typeof parsed.prompt === 'string' && parsed.prompt.trim() ? parsed : null
  } catch {
    sessionStorage.removeItem(PROMPT_TRANSFER_KEY)
    return null
  }
}
