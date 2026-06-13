import { z } from 'zod'

const imageItemSchema = z.union([
  z.string().min(1).max(10_000_000),
  z.object({ url: z.string().min(1).max(10_000_000) }),
])

export const compatImageGenerationSchema = z.object({
  model: z.string().min(1).max(120),
  prompt: z.string().min(1).max(4000),
  n: z.coerce.number().int().min(1).max(8).default(1),
  size: z.string().min(1).max(30).optional(),
  aspect_ratio: z.string().min(1).max(20).optional(),
  ratio: z.string().min(1).max(20).optional(),
  size_tier: z.string().min(1).max(10).optional(),
  resolution: z.string().min(1).max(10).optional(),
  response_format: z.literal('url').default('url'),
  quality: z.string().optional(),
  background: z.string().optional(),
  output_format: z.enum(['png', 'jpeg', 'jpg', 'webp']).optional(),
  stream: z.boolean().optional(),
})

export const compatImageEditSchema = compatImageGenerationSchema.extend({
  image: z.union([imageItemSchema, z.array(imageItemSchema)]).optional(),
  image_url: z.union([z.string().min(1).max(10_000_000), z.array(z.string().min(1).max(10_000_000))]).optional(),
  mask: imageItemSchema.optional(),
})

export const compatChatCompletionSchema = z.object({
  model: z.string().min(1).max(120),
  messages: z.array(z.record(z.string(), z.unknown())).min(1).max(200),
  stream: z.boolean().default(false),
}).passthrough()

export const compatResponsesSchema = z.object({
  model: z.string().min(1).max(120),
  input: z.unknown(),
  stream: z.boolean().default(false),
}).passthrough()
