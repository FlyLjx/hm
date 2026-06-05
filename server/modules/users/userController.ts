import type { Request, Response } from 'express'
import { getRequestOrigin } from '../../shared/origin.js'
import { getRequestIp } from '../../shared/requestIp.js'
import { getStringParam } from '../../shared/requestParams.js'
import {
  createUserSchema,
  forgotPasswordSchema,
  loginSchema,
  rechargeUserSchema,
  resetPasswordSchema,
  updateUserSchema,
  updateUserStatusSchema,
  verifyEmailSchema,
} from './userSchemas.js'
import { UserService } from './userService.js'

const userService = new UserService()

export class UserController {
  async list(_req: Request, res: Response) {
    const users = await userService.listUsers()
    res.json({ data: users })
  }

  async create(req: Request, res: Response) {
    const input = createUserSchema.parse(req.body)
    const user = await userService.createUser(input, { source: 'admin' })
    res.status(201).json({ data: user })
  }

  async register(req: Request, res: Response) {
    const input = createUserSchema.parse({ ...req.body, role: 'user' })
    const user = await userService.createUser(input, {
      source: 'public',
      userIp: getRequestIp(req),
      origin: getRequestOrigin(req),
    })
    res.status(201).json({ data: user })
  }

  async login(req: Request, res: Response) {
    const input = loginSchema.parse(req.body)
    const user = await userService.login(input)
    res.json({ data: user })
  }

  async profile(req: Request, res: Response) {
    const user = await userService.getPublicUser(getStringParam(req.params.id, 'id'))
    res.json({ data: user })
  }

  async updateStatus(req: Request, res: Response) {
    const input = updateUserStatusSchema.parse(req.body)
    const user = await userService.updateStatus(getStringParam(req.params.id, 'id'), input.status)
    res.json({ data: user })
  }

  async update(req: Request, res: Response) {
    const input = updateUserSchema.parse(req.body)
    const user = await userService.updateUser(getStringParam(req.params.id, 'id'), input)
    res.json({ data: user })
  }

  async recharge(req: Request, res: Response) {
    const input = rechargeUserSchema.parse(req.body)
    const result = await userService.rechargeUser(getStringParam(req.params.id, 'id'), input)
    res.json({ data: result })
  }

  async details(req: Request, res: Response) {
    const details = await userService.getUserDetails(getStringParam(req.params.id, 'id'))
    res.json({ data: details })
  }

  async delete(req: Request, res: Response) {
    await userService.deleteUser(getStringParam(req.params.id, 'id'))
    res.status(204).send()
  }

  async verifyEmail(req: Request, res: Response) {
    const input = verifyEmailSchema.parse(req.body)
    const user = await userService.verifyEmail(input.token)
    res.json({ data: user })
  }

  async forgotPassword(req: Request, res: Response) {
    const input = forgotPasswordSchema.parse(req.body)
    await userService.sendPasswordResetEmail(input.email, getRequestOrigin(req))
    res.json({ data: { sent: true } })
  }

  async resetPassword(req: Request, res: Response) {
    const input = resetPasswordSchema.parse(req.body)
    await userService.resetPassword(input)
    res.json({ data: { reset: true } })
  }
}
