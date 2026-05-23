export type UserRole = 'admin' | 'user'
export type UserStatus = 'active' | 'disabled'

export type User = {
  id: string
  email: string
  passwordHash: string
  credits: number
  role: UserRole
  status: UserStatus
  emailVerifiedAt: string | null
  createdAt: string
  updatedAt: string
}

export type PublicUser = Omit<User, 'passwordHash'>
