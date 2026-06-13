import { AppError } from '../../shared/AppError.js'
import type { ApiProvider } from '../apiProviders/apiProviderTypes.js'
import type { TaskRepository } from '../tasks/taskRepository.js'

export type GenerationOutputFormat = 'png' | 'jpeg' | 'webp'
export type ExtractedImage = { b64_json?: string; url?: string }
export type ReferenceImageInput = {
  referenceImageUrl?: string
  referenceImageUrls?: string[]
}

export function summarizeReferenceImage(value?: string) {
  if (!value) return null
  return {
    type: value.startsWith('data:') ? 'base64' : 'url',
    length: value.length,
  }
}

export function parseDataImage(value: string) {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match) return null
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  }
}

export function getImageExtension(contentType: string) {
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'
  if (contentType.includes('webp')) return 'webp'
  if (contentType.includes('gif')) return 'gif'
  return 'png'
}

export function normalizeReferenceImageUrls(input: ReferenceImageInput) {
  const urls = [...(input.referenceImageUrls ?? []), ...(input.referenceImageUrl ? [input.referenceImageUrl] : [])]
    .filter((value): value is string => Boolean(value))
  return [...new Set(urls)].slice(0, 5)
}

export function summarizeReferenceImages(values?: string[]) {
  const urls = values ?? []
  return urls.map(summarizeReferenceImage)
}

export function summarizeMaskImage(value?: string) {
  return value ? summarizeReferenceImage(value) : null
}

export function detectImageContentType(buffer: Buffer, fallback = 'image/png') {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return 'image/jpeg'
  }
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp'
  }
  if (buffer.subarray(0, 6).toString('ascii').startsWith('GIF')) {
    return 'image/gif'
  }
  return fallback.startsWith('image/') ? fallback : 'image/png'
}

function parseInternalTaskImageUrl(value: string) {
  const match = value.match(/\/api\/tasks\/([^/]+)\/images\/(\d+)(?:$|[?#])/)
  if (!match) return null
  return {
    taskId: decodeURIComponent(match[1]),
    index: Number(match[2]),
  }
}

export async function readReferenceImage(value: string, taskRepository: TaskRepository) {
  const dataImage = parseDataImage(value)
  if (dataImage) {
    return dataImage
  }

  const internalTaskImage = parseInternalTaskImageUrl(value)
  if (internalTaskImage) {
    const imageUrl = await taskRepository.findImageUrlByIndex(internalTaskImage.taskId, internalTaskImage.index)
    if (!imageUrl) {
      throw new AppError(404, '参考图不存在')
    }
    return readReferenceImage(imageUrl, taskRepository)
  }

  const response = await fetch(value)
  if (!response.ok) {
    throw new AppError(response.status, `参考图读取失败：${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  return {
    contentType: detectImageContentType(buffer, response.headers.get('content-type') ?? 'image/png'),
    buffer,
  }
}

function normalizeImageUrl(value: string) {
  const trimmed = value.trim().replace(/[),.;]+$/g, '')
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:image/')) {
    return trimmed
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.length > 200) {
    return `data:image/png;base64,${trimmed.replace(/\s/g, '')}`
  }
  return null
}

export function imageContentTypeFromFormat(format?: string | null) {
  const normalized = String(format || '').toLowerCase()
  if (normalized === 'jpg' || normalized === 'jpeg') return 'image/jpeg'
  if (normalized === 'webp') return 'image/webp'
  return 'image/png'
}

export function normalizeOutputFormat(format?: string | null): GenerationOutputFormat | null {
  const normalized = String(format || '').toLowerCase()
  if (normalized === 'jpg' || normalized === 'jpeg') return 'jpeg'
  if (normalized === 'webp') return 'webp'
  if (normalized === 'png') return 'png'
  return null
}

function resolveProviderUrl(provider: ApiProvider, value: string) {
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:image/')) return trimmed
  if (trimmed.startsWith('/')) {
    const baseUrl = provider.baseUrl.replace(/\/+$/, '')
    const normalizedBaseUrl = trimmed.startsWith('/v1/') && /\/v1$/i.test(baseUrl)
      ? baseUrl.replace(/\/v1$/i, '')
      : baseUrl
    return `${normalizedBaseUrl}${trimmed}`
  }
  return trimmed
}

export function extractImageUrlsFromText(value: string, provider?: ApiProvider) {
  const candidates = [
    ...Array.from(value.matchAll(/!\[[^\]]*]\(([^)\s]+)\)/g)).map((match) => match[1]),
    ...Array.from(value.matchAll(/<(?:img|video|source)[^>]+\bsrc=["']([^"']+)["']/gi)).map((match) => match[1]),
    ...Array.from(value.matchAll(/(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+)/g)).map((match) => match[1]),
    ...Array.from(value.matchAll(/(https?:\/\/[^\s<>"'`\]]+)/gi)).map((match) => match[1]),
    ...Array.from(value.matchAll(/(^|[\s"'(])((?:\/v1\/files|\/files|\/api\/files)\/[^\s<>"')]+)/gi)).map((match) => match[2]),
  ]

  const seen = new Set<string>()
  return candidates
    .map((candidate) => provider ? resolveProviderUrl(provider, candidate) : candidate)
    .map((candidate) => normalizeImageUrl(candidate))
    .filter((candidate): candidate is string => Boolean(candidate))
    .filter((candidate) => {
      if (seen.has(candidate)) return false
      seen.add(candidate)
      return true
    })
}

export function extractImagesFromResult(value: unknown, depth = 0, outputFormat?: string): ExtractedImage[] {
  if (!value || depth > 8) return []

  if (typeof value === 'string') {
    return extractImageUrlsFromText(value).map((url) => ({ url }))
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractImagesFromResult(item, depth + 1, outputFormat))
  }

  if (typeof value !== 'object') return []

  const payload = value as Record<string, unknown>
  const directUrl = [
    payload.url,
    payload.image_url,
    payload.imageUrl,
    payload.output_url,
    payload.outputUrl,
    payload.file_url,
    payload.fileUrl,
  ].find((item): item is string => typeof item === 'string')
  const normalizedUrl = directUrl ? normalizeImageUrl(directUrl) : null
  const directUrls = [
    payload.urls,
    payload.image_urls,
    payload.imageUrls,
    payload.output_urls,
    payload.outputUrls,
    payload.file_urls,
    payload.fileUrls,
  ]
    .filter(Array.isArray)
    .flatMap((items) => items.filter((item): item is string => typeof item === 'string'))
    .map((item) => normalizeImageUrl(item))
    .filter((item): item is string => Boolean(item))
  const directBase64 = [
    payload.b64_json,
    payload.b64,
    payload.base64,
    payload.image,
    payload.image_base64,
    payload.imageBase64,
    payload.partial_image_b64,
  ].find((item): item is string => typeof item === 'string')

  const directImages: ExtractedImage[] = []
  if (normalizedUrl) directImages.push({ url: normalizedUrl })
  directImages.push(...directUrls.map((url) => ({ url })))
  if (directBase64) {
    const normalizedBase64 = normalizeImageUrl(directBase64)
    directImages.push(
      normalizedBase64?.startsWith('data:image/')
        ? { url: normalizedBase64 }
        : { url: `data:${imageContentTypeFromFormat(outputFormat)};base64,${directBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').replace(/\s/g, '')}` },
    )
  }

  const nestedKeys = [
    'data',
    'result',
    'results',
    'output',
    'outputs',
    'images',
    'image',
    'urls',
    'image_urls',
    'imageUrls',
    'output_urls',
    'outputUrls',
    'file_urls',
    'fileUrls',
    'final',
    'partial',
    'choices',
    'message',
    'content',
  ]
  return [
    ...directImages,
    ...nestedKeys.flatMap((key) => extractImagesFromResult(payload[key], depth + 1, outputFormat)),
  ]
}

export function extractFinalImagesFromResult(value: unknown, outputFormat?: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return extractImagesFromResult(value, 0, outputFormat)
  const payload = value as Record<string, unknown>
  const finalImages = extractImagesFromResult(payload.final, 0, outputFormat)
  if (finalImages.length) return finalImages
  const dataImages = extractImagesFromResult(payload.data, 0, outputFormat)
  if (dataImages.length) return dataImages
  if (payload.stream === true) return []
  const withoutPartial = omitPartialImagePayload(payload) as Record<string, unknown>
  const resultImages = extractImagesFromResult(withoutPartial.result ?? withoutPartial.results ?? withoutPartial.output ?? withoutPartial.outputs ?? withoutPartial.images, 0, outputFormat)
  if (resultImages.length) return resultImages
  return extractImagesFromResult(withoutPartial, 0, outputFormat)
}

export async function materializeImageResult(resultJson: unknown, outputFormat?: string) {
  const images = uniqueImages(extractFinalImagesFromResult(resultJson, outputFormat))
  const urlImages = uniqueImages(images.filter((image) => (
    typeof image.url === 'string' &&
    /^https?:\/\//i.test(image.url)
  )))

  return {
    data: urlImages,
    stream: Boolean(resultJson && typeof resultJson === 'object' && (resultJson as { stream?: unknown }).stream),
  }
}

export function combineImageResults(results: unknown[], outputFormat?: string) {
  return {
    data: uniqueImages(results.flatMap((result) => extractFinalImagesFromResult(result, outputFormat))),
    stream: results.some((result) => Boolean(result && typeof result === 'object' && (result as { stream?: unknown }).stream)),
  }
}

export function hasFinalImageResult(resultJson: unknown, outputFormat?: string) {
  if (!resultJson || typeof resultJson !== 'object' || Array.isArray(resultJson)) {
    return summarizeImageResult(resultJson, outputFormat).imageCount > 0
  }

  const payload = resultJson as Record<string, unknown>
  if (payload.stream === true) {
    return summarizeImageResult(payload.final ?? payload.data, outputFormat).imageCount > 0
  }

  return summarizeImageResult(resultJson, outputFormat).imageCount > 0
}

export function summarizeImageResult(resultJson: unknown, outputFormat?: string) {
  if (!resultJson || typeof resultJson !== 'object') {
    return { imageCount: 0 }
  }
  const images = uniqueImages(extractFinalImagesFromResult(resultJson, outputFormat))

  return {
    imageCount: images.length,
    images: images.map((image) => ({
      type: image.url ? 'url' : image.b64_json ? 'base64' : 'unknown',
      url: image.url,
      base64Length: image.b64_json?.length,
    })),
  }
}

export function normalizeImageResult(resultJson: unknown, outputFormat?: string) {
  const images = uniqueImages(extractFinalImagesFromResult(resultJson, outputFormat))
  if (images.length === 0) return resultJson
  return {
    ...(resultJson && typeof resultJson === 'object' && !Array.isArray(resultJson) ? resultJson as Record<string, unknown> : {}),
    data: images,
  }
}

export function uniqueImages(images: ExtractedImage[]) {
  const seen = new Set<string>()
  return images.filter((image) => {
    const key = image.url ?? image.b64_json
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isPartialPayloadKey(key: string) {
  return /partial|preview|thumbnail|delta|progress/i.test(key)
}

export function hasPartialImagePayload(value: unknown, depth = 0): boolean {
  if (!value || depth > 8) return false
  if (Array.isArray(value)) return value.some((item) => hasPartialImagePayload(item, depth + 1))
  if (typeof value !== 'object') return false

  const payload = value as Record<string, unknown>
  if (typeof payload.partial_image_b64 === 'string') return true
  const eventType = [payload.type, payload.event, payload.object, payload.status]
    .filter((item): item is string => typeof item === 'string')
    .join(' ')
    .toLowerCase()
  if (
    /partial|preview|progress|delta|in_progress|generating|queued|submitted/.test(eventType) &&
    extractImagesFromResult(payload).length > 0
  ) {
    return true
  }
  if (
    Object.entries(payload).some(([key, item]) =>
      isPartialPayloadKey(key) && extractImagesFromResult(item).length > 0,
    )
  ) {
    return true
  }

  return Object.values(payload).some((item) => hasPartialImagePayload(item, depth + 1))
}

export function hasFinalImagePayload(value: unknown, depth = 0): boolean {
  if (!value || depth > 8) return false
  if (Array.isArray(value)) return value.some((item) => hasFinalImagePayload(item, depth + 1))
  if (typeof value !== 'object') return false

  const payload = value as Record<string, unknown>
  const finalStringKeys = [
    'url',
    'b64_json',
    'image_url',
    'imageUrl',
    'output_url',
    'outputUrl',
    'file_url',
    'fileUrl',
  ]
  if (finalStringKeys.some((key) => typeof payload[key] === 'string')) return true

  const finalArrayKeys = [
    'urls',
    'image_urls',
    'imageUrls',
    'output_urls',
    'outputUrls',
    'file_urls',
    'fileUrls',
  ]
  if (finalArrayKeys.some((key) => Array.isArray(payload[key]) && (payload[key] as unknown[]).some((item) => typeof item === 'string'))) {
    return true
  }

  return Object.entries(payload)
    .filter(([key]) => key !== 'partial_image_b64')
    .some(([, item]) => hasFinalImagePayload(item, depth + 1))
}

export function omitPartialImagePayload(value: unknown, depth = 0): unknown {
  if (!value || depth > 8) return value
  if (Array.isArray(value)) return value.map((item) => omitPartialImagePayload(item, depth + 1))
  if (typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !isPartialPayloadKey(key) && key !== 'partial_image_b64')
      .map(([key, item]) => [key, omitPartialImagePayload(item, depth + 1)]),
  )
}
