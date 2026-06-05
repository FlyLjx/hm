import { z } from 'zod'

export const modelCapabilitySchema = z.literal('chat_image')

export const createModelSchema = z.object({
  providerId: z.string().min(1).max(36),
  modelName: z.string().min(1).max(120),
  displayName: z.string().min(1).max(120),
  capability: modelCapabilitySchema.default('chat_image'),
  cost1k: z.number().min(0).default(0),
  cost2k: z.number().min(0).default(0),
  cost4k: z.number().min(0).default(0),
  markupPercent: z.number().min(0).max(10000).default(0),
  price1k: z.number().min(0).default(0),
  price2k: z.number().min(0).default(0),
  price4k: z.number().min(0).default(0),
  appendSizeToPrompt: z.boolean().default(false),
})

export const updateModelSchema = createModelSchema.partial().extend({
  status: z.enum(['active', 'disabled']).optional(),
})

export const syncModelsSchema = z.object({
  providerId: z.string().min(1).max(36),
  capability: modelCapabilitySchema.default('chat_image'),
  keyword: z.string().max(120).optional().default(''),
  aliasPrefix: z.string().max(80).optional().default(''),
  markupPercent: z.number().min(0).max(10000).optional().default(0),
})

export const deleteModelsSchema = z.object({
  ids: z.array(z.string().min(1).max(36)).min(1),
})
