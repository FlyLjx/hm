export type SystemSettings = {
  siteName: string
  creditName: string
  frontendUrl: string
  backendUrl: string
  registerMode: 'open' | 'closed'
  emailEnabled: boolean
  emailHost: string
  emailPort: number
  emailSecure: boolean
  emailUser: string
  emailPassword: string
  emailFromName: string
  emailFromAddress: string
  registerEmailVerification: boolean
}
