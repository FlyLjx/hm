import { AppError } from '../../shared/AppError.js'
import { SettingRepository } from '../settings/settingRepository.js'

type MatchResult = {
  category: 'adult' | 'political'
  keyword: string
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？、,.!?;；:："'“”‘’()[\]{}<>《》【】|\\/_+=\-*&^%$#@~`·]/g, '')
}

function parseKeywords(value: string) {
  return value
    .split(/[\n,，;；|]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

function findKeyword(prompt: string, keywords: string[]) {
  const normalizedPrompt = normalizeText(prompt)
  return keywords.find((keyword) => {
    const normalizedKeyword = normalizeText(keyword)
    return normalizedKeyword && normalizedPrompt.includes(normalizedKeyword)
  }) ?? null
}

export class PromptModerationService {
  constructor(private readonly settingRepository = new SettingRepository()) {}

  async assertAllowed(prompt: string) {
    const settings = await this.settingRepository.getSettings()
    if (!settings.promptModerationEnabled) return

    const match = this.match(prompt, {
      adultKeywords: settings.promptModerationAdultKeywords,
      politicalKeywords: settings.promptModerationPoliticalKeywords,
    })
    if (!match) return

    throw new AppError(400, settings.promptModerationRejectMessage || '提示词包含不支持生成的敏感内容，请修改后再试。')
  }

  match(prompt: string, input: { adultKeywords: string; politicalKeywords: string }): MatchResult | null {
    const adultKeyword = findKeyword(prompt, parseKeywords(input.adultKeywords))
    if (adultKeyword) {
      return { category: 'adult', keyword: adultKeyword }
    }

    const politicalKeyword = findKeyword(prompt, parseKeywords(input.politicalKeywords))
    if (politicalKeyword) {
      return { category: 'political', keyword: politicalKeyword }
    }

    return null
  }
}
