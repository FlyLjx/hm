import type { CurrentUser } from '../api/clientApi'

type StoredUser = Partial<CurrentUser> & {
  userId?: string
}

const USER_KEY = 'aipi_user'
const USER_ID_KEY = 'aipi_user_id'

export function getCurrentUserId() {
  const directUserId = localStorage.getItem(USER_ID_KEY)
  if (directUserId) {
    return directUserId
  }

  const rawUser = localStorage.getItem(USER_KEY)
  if (!rawUser) {
    return ''
  }

  try {
    const user = JSON.parse(rawUser) as StoredUser
    return user.id || user.userId || ''
  } catch {
    return ''
  }
}

export function getCurrentUser() {
  const rawUser = localStorage.getItem(USER_KEY)
  if (!rawUser) {
    return null
  }

  try {
    const user = JSON.parse(rawUser) as CurrentUser
    return user.id ? user : null
  } catch {
    return null
  }
}

export function saveCurrentUser(user: CurrentUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  localStorage.setItem(USER_ID_KEY, user.id)
}

export function clearCurrentUser() {
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(USER_ID_KEY)
}
