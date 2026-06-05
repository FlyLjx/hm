export type UserCheckin = {
  id: string
  userId: string
  userEmail?: string | null
  rewardCredits: number
  checkinDate: string
  userIp?: string | null
  createdAt: string
}
