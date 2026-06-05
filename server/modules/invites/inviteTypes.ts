export type UserInvite = {
  id: string
  inviterId: string
  inviterEmail?: string | null
  inviteeId: string
  inviteeEmail?: string | null
  rewardCredits: number
  inviteeIp?: string | null
  createdAt: string
}
