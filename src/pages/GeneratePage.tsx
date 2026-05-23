import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, Sparkles } from 'lucide-react'
import { clientApi, type AiModel, type CurrentUser, type GenerationTask } from '../api/clientApi'
import { CreditToast } from '../components/CreditToast'
import { ModelPicker } from '../components/ModelPicker'
import { PageTitle } from '../components/PageTitle'
import {
  getActiveModelsByCapability,
  getModelLabel,
  getModelPrice,
  getRatioBoxStyle,
  getSizeLabel,
  quantityOptions,
  ratioOptions,
  sizeMap,
  sizeTierOptions,
  type RatioOption,
  type SizeTierOption,
} from '../lib/generationOptions'
import { saveCurrentUser } from '../lib/currentUser'
import { pollGenerationTask } from '../lib/taskPolling'

type GeneratePageProps = {
  creditName: string
  currentUser: CurrentUser | null
  onUserUpdated: (user: CurrentUser) => void
  onRequireLogin: () => void
}

export function GeneratePage({
  creditName,
  currentUser,
  onRequireLogin,
  onUserUpdated,
}: GeneratePageProps) {
  const [models, setModels] = useState<AiModel[]>([])
  const [prompt, setPrompt] = useState('')
  const [modelId, setModelId] = useState('')
  const [ratio, setRatio] = useState<RatioOption>('16:9')
  const [sizeTier, setSizeTier] = useState<SizeTierOption>('2k')
  const [quantity, setQuantity] = useState(1)
  const [isGenerating, setIsGenerating] = useState(false)
  const [notice, setNotice] = useState('')
  const [creditToastOpen, setCreditToastOpen] = useState(false)
  const [currentTask, setCurrentTask] = useState<GenerationTask | null>(null)

  const imageModels = useMemo(() => getActiveModelsByCapability(models, 'image'), [models])
  const selectedModel = imageModels.find((model) => model.id === modelId)
  const outputSize = sizeMap[ratio][sizeTier]
  const estimatedCost = getModelPrice(selectedModel, sizeTier) * quantity

  useEffect(() => {
    let ignore = false
    clientApi
      .listModels()
      .then((response) => {
        if (ignore) return
        const activeModels = getActiveModelsByCapability(response.data, 'image')
        setModels(response.data)
        setModelId((current) => current || activeModels[0]?.id || '')
      })
      .catch(() => {
        if (!ignore) {
          setModels([])
        }
      })

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (!creditToastOpen) {
      return
    }

    const timer = window.setTimeout(() => setCreditToastOpen(false), 3000)
    return () => window.clearTimeout(timer)
  }, [creditToastOpen])

  const handleGenerate = async () => {
    setNotice('')
    if (!currentUser) {
      onRequireLogin()
      return
    }
    if (!modelId) {
      setNotice('请先选择可用模型')
      return
    }
    if (!prompt.trim()) {
      setNotice('请输入图片描述')
      return
    }
    if (currentUser.credits < estimatedCost) {
      setCreditToastOpen(true)
      return
    }

    setIsGenerating(true)
    try {
      const response = await clientApi.generateImage({
        userId: currentUser.id,
        modelId,
        prompt: prompt.trim(),
        sizeTier,
        size: outputSize,
        quantity,
      })
      setCurrentTask(response.data)
      setNotice('任务已提交，正在后台生成')

      const completedTask = await pollGenerationTask(response.data.id, setCurrentTask)
      if (completedTask.status === 'failed') {
        throw new Error(completedTask.errorMessage || '生成失败')
      }
      const nextUser = {
        ...currentUser,
        credits: completedTask.remainingCredits,
      }
      saveCurrentUser(nextUser)
      onUserUpdated(nextUser)
      setNotice('生成完成')
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成失败'
      if (message.includes('积分不足') || message.includes('余额不足')) {
        setCreditToastOpen(true)
      } else {
        setNotice(message)
      }
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <section className="center-page">
      <PageTitle title="AI 图片工坊" subtitle="用文字生成创意作品" />

      <div className="generator-card">
        <textarea
          maxLength={2000}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="一句话描述你想生成的画面，例如：未来城市雨夜，电影感，霓虹反光，广角镜头"
          value={prompt}
        />
        <div className="upload-row">
          <button className="upload-button" type="button">
            <Plus size={18} aria-hidden="true" />
            上传参考图
          </button>
          <span>{prompt.length}/2000</span>
        </div>

        <div className="generator-config">
          <label className="option-field">
            <span>模型</span>
            <ModelPicker models={imageModels} value={modelId} onChange={setModelId} />
          </label>

          <div className="option-field">
            <span>比例</span>
            <div className="segmented-options ratio-options">
              {ratioOptions.map((item) => (
                <button
                  className={ratio === item ? 'active' : ''}
                  key={item}
                  onClick={() => setRatio(item)}
                  type="button"
                >
                  <span className="ratio-shape" style={getRatioBoxStyle(item)} />
                  <span>{item}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="option-field">
            <span>清晰度</span>
            <div className="segmented-options">
              {sizeTierOptions.map((item) => (
                <button
                  className={sizeTier === item ? 'active' : ''}
                  key={item}
                  onClick={() => setSizeTier(item)}
                  type="button"
                >
                  <span>{item.toUpperCase()}</span>
                  <small>
                    {getModelPrice(selectedModel, item).toFixed(2)}
                    {creditName}/次
                  </small>
                </button>
              ))}
            </div>
          </div>

          <div className="option-field">
            <span>并发数量</span>
            <div className="segmented-options">
              {quantityOptions.map((item) => (
                <button
                  className={quantity === item ? 'active' : ''}
                  key={item}
                  onClick={() => setQuantity(item)}
                  type="button"
                >
                  {item} 张
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="generator-footer">
          <span>
            {getModelLabel(selectedModel)} · {ratio} · {getSizeLabel(ratio, sizeTier)} · {quantity} 张
          </span>
          <strong>
            预计扣费 {estimatedCost.toFixed(2)} {creditName}
          </strong>
          <button
            className="generate-button"
            disabled={isGenerating}
            onClick={handleGenerate}
            type="button"
          >
            <Sparkles size={16} aria-hidden="true" />
            {isGenerating ? '生成中' : '开始生成'}
          </button>
        </div>
        {notice && <p className="form-notice">{notice}</p>}
      </div>

      <CreditToast
        balance={currentUser?.credits}
        cost={estimatedCost}
        creditName={creditName}
        open={creditToastOpen}
      />

      <section className="result-section">
        <div className="section-tabs">
          <button className="active" type="button">生成结果</button>
        </div>
        <div className="result-panel">
          {!currentTask && <p>提交任务后，这里会显示真实生成结果。</p>}
          {currentTask?.status === 'pending' && (
            <div className="result-pending">
              <Loader2 className="spin-icon" size={24} aria-hidden="true" />
              <span>图片生成中...</span>
            </div>
          )}
          {currentTask?.status === 'success' && currentTask.resultUrl && (
            <img src={currentTask.resultUrl} alt="生成结果" />
          )}
          {currentTask?.status === 'failed' && <p>{currentTask.errorMessage || '生成失败'}</p>}
        </div>
      </section>
    </section>
  )
}
