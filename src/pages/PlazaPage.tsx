import { useMemo, useState } from 'react'
import { PageTitle } from '../components/PageTitle'
import { PromptCard } from '../components/PromptCard'
import { promptCategories, promptItems } from '../data'
import type { PromptCategory } from '../types/app'

const modelFilters = ['全部模型', 'GPT-Image-2', 'GPT-4o', '通用']

export function PlazaPage() {
  const [activeCategory, setActiveCategory] = useState<PromptCategory>('热门')
  const [activeModel, setActiveModel] = useState(modelFilters[0])

  const visiblePrompts = useMemo(() => {
    return promptItems.filter((item) => {
      const categoryMatched =
        activeCategory === '热门' ? true : item.category === activeCategory || item.category === '热门'
      const modelMatched = activeModel === '全部模型' || item.model === activeModel
      return categoryMatched && modelMatched
    })
  }, [activeCategory, activeModel])

  const hotTags = useMemo(() => {
    const tagCount = new Map<string, number>()
    promptItems.forEach((item) => {
      item.tags.forEach((tag) => tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1))
    })
    return Array.from(tagCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([tag]) => tag)
  }, [])

  return (
    <section className="center-page wide">
      <PageTitle title="提示词广场" subtitle="按场景查找可复用的 AI 生图提示词" />

      <div className="plaza-filters">
        <div className="category-row">
          {promptCategories.map((item) => (
            <button
              className={activeCategory === item ? 'active' : ''}
              key={item}
              onClick={() => setActiveCategory(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>

        <div className="model-row">
          {modelFilters.map((model) => (
            <button
              className={activeModel === model ? 'active' : ''}
              key={model}
              onClick={() => setActiveModel(model)}
              type="button"
            >
              {model}
            </button>
          ))}
        </div>
      </div>

      <div className="plaza-layout">
        <div className="plaza-grid">
          {visiblePrompts.map((card) => (
            <PromptCard key={card.id} {...card} />
          ))}
        </div>

        <aside className="ranking-panel">
          <h2>分类说明</h2>
          <p className="panel-copy">
            GPT Image 2、电商主图、广告创意、人像、UI、角色、图像编辑和视频分镜已分开管理。
          </p>

          <h2>热门标签</h2>
          <div className="tag-cloud">
            {hotTags.map((tag) => (
              <button key={tag} type="button">
                {tag}
              </button>
            ))}
          </div>

          <h2>内容来源</h2>
          <div className="source-list">
            <span>awesome-gpt-image-2</span>
            <span>Awesome-GPT4o-Image-Prompts</span>
            <span>通用 image prompt patterns</span>
          </div>
        </aside>
      </div>
    </section>
  )
}
