import { z } from 'zod'

const openAiImageParamsSchema = z.record(z.string(), z.unknown()).default({})
const outputFormatSchema = z.enum(['png', 'jpeg', 'jpg', 'webp']).transform((value) => value === 'jpg' ? 'jpeg' : value)

export const generateImageSchema = z.object({
  userId: z.string().min(1).max(36),
  modelId: z.string().min(1).max(36),
  prompt: z.string().min(1).max(4000),
  sizeTier: z.enum(['1k', '2k', '4k']).default('1k'),
  size: z.string().min(1).max(30).optional(),
  transparentBackground: z.boolean().default(false),
  quantity: z.number().int().min(1).max(8).default(1),
  referenceImageUrl: z.string().min(1).max(10_000_000).optional(),
  referenceImageUrls: z.array(z.string().min(1).max(10_000_000)).max(5).optional(),
  maskImageUrl: z.string().min(1).max(10_000_000).optional(),
  outputFormat: outputFormatSchema.optional(),
  openaiParams: openAiImageParamsSchema.optional(),
})
