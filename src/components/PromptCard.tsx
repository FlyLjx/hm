import type { PromptItem } from '../types/app'

type PromptCardProps =
  | PromptItem
  | {
      color: string
      tag: string
      title: string
    }

export function PromptCard(props: PromptCardProps) {
  const isFullPrompt = 'prompt' in props
  const tag = isFullPrompt ? props.category : props.tag
  const summary = isFullPrompt ? props.prompt : '精选提示词，可一键复用生成'

  return (
    <article className={isFullPrompt ? 'prompt-card prompt-card-full' : 'prompt-card'}>
      <div className={`prompt-art ${props.color}`}>
        <span>{tag}</span>
      </div>
      <div>
        <strong>{props.title}</strong>
        {isFullPrompt && (
          <div className="prompt-meta">
            <span>{props.model}</span>
            <span>{props.source}</span>
          </div>
        )}
        <p>{summary}</p>
        {isFullPrompt && (
          <div className="prompt-tags">
            {props.tags.map((tagName) => (
              <span key={tagName}>{tagName}</span>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}
