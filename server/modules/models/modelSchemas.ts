import { z } from 'zod'

export const modelCapabilitySchema = z.enum(['image', 'video', 'chat_image', 'workflow'])

export const createModelSchema = z.object({
  providerId: z.string().min(1).max(36),
  modelName: z.string().min(1).max(120),
  displayName: z.string().min(1).max(120),
  capability: modelCapabilitySchema.default('image'),
  price1k: z.number().min(0).default(0),
  price2k: z.number().min(0).default(0),
  price4k: z.number().min(0).default(0),
})

export const updateModelSchema = createModelSchema.partial().extend({
  status: z.enum(['active', 'disabled']).optional(),
})

export const syncModelsSchema = z.object({
  providerId: z.string().min(1).max(36),
  capability: modelCapabilitySchema.default('image'),
  keyword: z.string().max(120).optional().default(''),
})

export const deleteModelsSchema = z.object({
  ids: z.array(z.string().min(1).max(36)).min(1),
})
