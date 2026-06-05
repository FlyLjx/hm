const USER_KEY = 'aipi_user'
const USER_ID_KEY = 'aipi_user_id'

function normalizeLegacyUserId(userId) {
  const id = userId || ''
  const match = String(id).match(/^legacy-(\d+)$/)
  if (!match) return id
  return `00000000-0000-4000-8000-${match[1].padStart(12, '0')}`
}

export function getCurrentUserId() {
  const directUserId = localStorage.getItem(USER_ID_KEY)
  if (directUserId) return normalizeLegacyUserId(directUserId)
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return ''
  try {
    const user = JSON.parse(raw)
    return normalizeLegacyUserId(user.id || user.userId || '')
  } catch {
    return ''
  }
}

export function getCurrentUser() {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    const user = JSON.parse(raw)
    if (!user?.id) return null
    const normalizedId = normalizeLegacyUserId(user.id)
    if (normalizedId !== user.id) {
      const normalizedUser = { ...user, id: normalizedId }
      saveCurrentUser(normalizedUser)
      return normalizedUser
    }
    return user
  } catch {
    return null
  }
}

export function saveCurrentUser(user) {
  const normalizedUser = { ...user, id: normalizeLegacyUserId(user.id) }
  localStorage.setItem(USER_KEY, JSON.stringify(normalizedUser))
  localStorage.setItem(USER_ID_KEY, normalizedUser.id)
}

export function clearCurrentUser() {
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(USER_ID_KEY)
}
