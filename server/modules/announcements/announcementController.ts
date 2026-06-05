import type { Request, Response } from 'express'
import { getStringParam } from '../../shared/requestParams.js'
import {
  createAnnouncementSchema,
  publicAnnouncementQuerySchema,
  signAnnouncementSchema,
  updateAnnouncementSchema,
} from './announcementSchemas.js'
import { AnnouncementService } from './announcementService.js'

const announcementService = new AnnouncementService()

export class AnnouncementController {
  async list(_req: Request, res: Response) {
    const announcements = await announcementService.listAnnouncements()
    res.json({ data: announcements })
  }

  async listPublic(req: Request, res: Response) {
    const query = publicAnnouncementQuerySchema.parse(req.query)
    const announcements = await announcementService.listVisibleAnnouncements(query.userId)
    res.json({ data: announcements })
  }

  async create(req: Request, res: Response) {
    const input = createAnnouncementSchema.parse(req.body)
    const announcement = await announcementService.createAnnouncement(input)
    res.status(201).json({ data: announcement })
  }

  async update(req: Request, res: Response) {
    const input = updateAnnouncementSchema.parse(req.body)
    const announcement = await announcementService.updateAnnouncement(
      getStringParam(req.params.id, 'id'),
      input,
    )
    res.json({ data: announcement })
  }

  async delete(req: Request, res: Response) {
    await announcementService.deleteAnnouncement(getStringParam(req.params.id, 'id'))
    res.status(204).send()
  }

  async sign(req: Request, res: Response) {
    const input = signAnnouncementSchema.parse(req.body)
    const result = await announcementService.signAnnouncement({
      announcementId: getStringParam(req.params.id, 'id'),
      userId: input.userId,
    })
    res.json({ data: result })
  }
}
