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
    const hasPrompt = typeof parsed.prompt === 'string' && parsed.prompt.trim()
    const hasGenerationOptions = Boolean(parsed.modelId || parsed.model || parsed.ratio || parsed.sizeTier || parsed.imageUrl)
    return hasPrompt || hasGenerationOptions ? parsed : null
  } catch {
    sessionStorage.removeItem(PROMPT_TRANSFER_KEY)
    return null
  }
}
