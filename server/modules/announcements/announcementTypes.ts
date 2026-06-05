export type AnnouncementTargetType = 'all' | 'specific'
export type AnnouncementStatus = 'active' | 'disabled'
export type AnnouncementDisplayMode = 'popup' | 'home' | 'topbar'

export type Announcement = {
  id: string
  title: string
  content: string
  displayMode: AnnouncementDisplayMode
  targetType: AnnouncementTargetType
  status: AnnouncementStatus
  sortOrder: number
  userIds: string[]
  targetCount?: number
  readCount?: number
  unreadCount?: number
  readRate?: number
  createdAt: string
  updatedAt: string
}
