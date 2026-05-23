import { Clapperboard } from 'lucide-react'
import { PageTitle } from '../components/PageTitle'

export function VideoPage() {
  return (
    <section className="center-page">
      <PageTitle title="文字生成视频" subtitle="输入镜头描述，生成短视频" />
      <div className="generator-card video-card">
        <textarea placeholder="例如：未来城市清晨，银色飞行器穿过玻璃建筑，镜头缓慢前推，电影感" />
        <div className="generator-options">
          <button type="button">5 秒</button>
          <button type="button">16:9</button>
          <button type="button">电影运镜</button>
          <button className="generate-button" type="button">
            <Clapperboard size={16} aria-hidden="true" />
            生成视频
          </button>
        </div>
      </div>
    </section>
  )
}
