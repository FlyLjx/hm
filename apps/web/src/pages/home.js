import { formatAmount } from '../common/format.js'
import { renderMarkdown } from '../common/markdown.js'

export const HomePage = {
  props: ['announcements', 'creditName', 'currentUser', 'promotions', 'settings', 'siteName', 'subscriptionPlans'],
  emits: ['announcement-close', 'go', 'login', 'recharge', 'subscribe'],
  setup() {
    function promotionIcon(item) {
      const icon = String(item?.badge || '').trim()
      return icon.startsWith('ti-') ? icon : 'ti-speakerphone'
    }
    function announcementHtml(item) {
      return renderMarkdown(item?.content || '')
    }
    return { announcementHtml, formatAmount, promotionIcon }
  },
  template: `
    <div class="home-page">
      <section v-if="announcements?.length" :class="['home-announcement-strip', { single: announcements.length === 1 }]">
        <article v-for="item in announcements.slice(0, 2)" :key="item.id">
          <div class="home-announcement-icon"><i class="ti ti-speakerphone"></i></div>
          <div class="home-announcement-body">
            <span>{{ item.title }}</span>
            <div class="home-announcement-md" v-html="announcementHtml(item)"></div>
          </div>
          <button type="button" title="关闭" @click="$emit('announcement-close', item)">
            <i class="ti ti-x"></i>
          </button>
        </article>
      </section>

      <section v-if="promotions?.length" :class="['home-notice-strip', { single: promotions.length === 1 }]">
        <article v-for="item in promotions.slice(0, 2)" :key="item.id">
          <div class="home-notice-icon"><i :class="['ti', promotionIcon(item)]"></i></div>
          <div class="home-notice-body">
            <span>{{ item.title }}</span>
            <strong>{{ item.content }}</strong>
          </div>
          <a v-if="item.actionText && item.actionUrl" class="home-notice-action" :href="item.actionUrl">
            {{ item.actionText }}
            <i class="ti ti-arrow-right"></i>
          </a>
        </article>
      </section>

      <section class="home-hero clean-home-hero">
        <div class="hero-copy">
          <span class="eyebrow"><i class="ti ti-sparkles"></i> AI Image Workspace</span>
          <h1>一个更清爽的 AI 生图工作台</h1>
          <p>{{ siteName }} 支持对话生图、参考图改图、高清结果下载和账户积分管理。打开创作中心，输入提示词即可开始生成。</p>
          <div class="hero-actions">
            <el-button type="primary" size="large" @click="$emit('go', 'chat')">
              <i class="ti ti-message-2"></i>
              立即创作
            </el-button>
            <el-button size="large" @click="$emit('go', 'plaza')">
              <i class="ti ti-layout-grid"></i>
              浏览灵感
            </el-button>
            <el-button v-if="currentUser" size="large" @click="$emit('recharge')">
              <i class="ti ti-wallet"></i>
              充值{{ creditName }}
            </el-button>
            <el-button v-else size="large" @click="$emit('login')">
              <i class="ti ti-user"></i>
              登录 / 注册
            </el-button>
          </div>
          <div class="home-signal-row">
            <span><i></i> 对话生成</span>
            <span><i></i> 参考图改图</span>
            <span><i></i> 高清下载</span>
            <span><i></i> 积分扣费透明</span>
          </div>
          <div class="home-hero-stats">
            <div>
              <strong>3</strong>
              <span>核心创作步骤</span>
            </div>
            <div>
              <strong>{{ settings?.rechargeEnabled ? '开放' : '关闭' }}</strong>
              <span>在线充值</span>
            </div>
            <div>
              <strong>1:{{ settings?.rechargeRate || 1 }}</strong>
              <span>充值兑换比例</span>
            </div>
          </div>
        </div>
        <div class="home-dashboard-preview home-creation-preview">
          <div class="preview-toolbar">
            <div class="preview-window-dots"><span></span><span></span><span></span></div>
            <strong>AIπ 智能创作</strong>
            <em>创作预览</em>
          </div>
          <div class="preview-workbench">
            <div class="preview-prompt-panel">
              <div class="preview-prompt-heading">
                <i class="ti ti-sparkles"></i>
                <div>
                  <strong>创作指令</strong>
                  <span>新品饮品海报</span>
                </div>
              </div>
              <p>为奶茶店生成一张清爽的青柠气泡茶新品海报，绿色系，留白充足，商品主体清晰。</p>
              <div class="preview-parameter-grid">
                <div>
                  <span>模型</span>
                  <strong>GPT Image</strong>
                </div>
                <div>
                  <span>比例</span>
                  <strong>1 : 1</strong>
                </div>
                <div>
                  <span>清晰度</span>
                  <strong>2K 高清</strong>
                </div>
                <div>
                  <span>格式</span>
                  <strong>JPEG</strong>
                </div>
              </div>
              <small class="preview-prompt-note"><i class="ti ti-wand"></i> 已启用智能构图与文字排版</small>
            </div>
            <div class="preview-result-panel">
              <div class="preview-result-frame">
                <div class="preview-poster-art">
                  <img src="/web/assets/home-preview-lime-tea.png" alt="青柠气泡茶海报预览" />
                  <div class="preview-poster-mark">AIπ</div>
                  <div class="preview-poster-copy">
                    <span>SUMMER SPECIAL</span>
                    <h3>青柠气泡茶</h3>
                    <p>鲜萃青柠 · 清爽气泡</p>
                    <b>新品尝鲜 ¥16.8</b>
                  </div>
                  <div class="preview-generate-state">
                    <i class="ti ti-check"></i>
                    <span>生成完成</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="preview-meta">
            <div>
              <i class="ti ti-wallet"></i>
              <span>账户余额</span>
              <strong>{{ currentUser ? formatAmount(currentUser.credits) : '--' }} {{ creditName }}</strong>
            </div>
            <div>
              <i class="ti ti-coins"></i>
              <span>本次预计</span>
              <strong>0.05 {{ creditName }}</strong>
            </div>
            <div>
              <i class="ti ti-aspect-ratio"></i>
              <span>输出规格</span>
              <strong>2048x2048</strong>
            </div>
          </div>
        </div>
      </section>

      <section v-if="subscriptionPlans?.length" class="home-commerce-panel">
        <div class="section-head">
          <div>
            <span>Offers</span>
            <h2>会员权益</h2>
            <p>选择适合你的订阅套餐，享受会员专属折扣和赠送额度。</p>
          </div>
          <el-button v-if="subscriptionPlans?.length" type="primary" @click="$emit('subscribe')">
            <i class="ti ti-crown"></i>
            查看订阅
          </el-button>
        </div>
        <div class="home-commerce-grid subscription-only">
          <article class="home-subscription-feature">
            <div class="home-commerce-kicker"><i class="ti ti-crown"></i> 会员订阅</div>
            <div class="home-subscription-list">
              <button v-for="plan in subscriptionPlans.slice(0, 2)" :key="plan.id" class="home-subscription-card" type="button" @click="$emit('subscribe')">
                <span v-if="plan.badge">{{ plan.badge }}</span>
                <strong>{{ plan.name }}</strong>
                <p>{{ plan.description || '开通后享受会员专属模型折扣。' }}</p>
                <div>
                  <b>¥{{ Number(plan.amount || 0).toFixed(2) }}</b>
                  <small>{{ plan.durationDays }} 天 · 赠送 {{ formatAmount(plan.bonusCredits) }} {{ creditName }}</small>
                </div>
                <em>{{ plan.discountPercent }}% 折扣</em>
              </button>
            </div>
          </article>
        </div>
      </section>

      <section class="home-status-grid">
        <article class="home-status-card primary">
          <i class="ti ti-coins"></i>
          <span>账户{{ creditName }}</span>
          <strong>{{ currentUser ? formatAmount(currentUser.credits) : '--' }}</strong>
          <p>{{ currentUser ? '可直接用于图片生成扣费' : '登录后查看余额并开始创作' }}</p>
        </article>
        <article class="home-status-card">
          <i class="ti ti-credit-card"></i>
          <span>充值状态</span>
          <strong>{{ settings?.rechargeEnabled ? '已开放' : '未开放' }}</strong>
          <p>支持支付宝扫码支付，到账后自动增加{{ creditName }}。</p>
        </article>
        <article class="home-status-card">
          <i class="ti ti-arrows-exchange"></i>
          <span>兑换比例</span>
          <strong>1:{{ settings?.rechargeRate || 1 }}</strong>
          <p>1 元兑换 {{ settings?.rechargeRate || 1 }} {{ creditName }}。</p>
        </article>
      </section>

      <section class="home-feature-grid">
        <article>
          <i class="ti ti-message-2"></i>
          <div>
            <strong>对话式生成</strong>
            <p>像聊天一样输入画面描述，系统自动提交任务并同步生成状态。</p>
          </div>
        </article>
        <article>
          <i class="ti ti-photo-plus"></i>
          <div>
            <strong>参考图改图</strong>
            <p>上传参考图或复用生成结果，继续做风格迁移、重绘和细节调整。</p>
          </div>
        </article>
        <article>
          <i class="ti ti-coins"></i>
          <div>
            <strong>积分清晰扣费</strong>
            <p>不同模型和清晰度展示预计扣费，余额变化可随时刷新查看。</p>
          </div>
        </article>
      </section>

      <section class="home-flow-panel glass-card">
        <div class="section-head">
          <div>
            <span>Workflow</span>
            <h2>三步完成一次生成</h2>
            <p>从提示词到成图，保留最短路径，也支持继续基于结果改图。</p>
          </div>
          <el-button type="primary" @click="$emit('go', 'chat')">
            <i class="ti ti-arrow-right"></i>
            进入创作中心
          </el-button>
        </div>
        <div class="home-flow-grid">
          <article>
            <span>01</span>
            <i class="ti ti-pencil"></i>
            <div>
              <strong>描述画面</strong>
              <p>输入你想要的主题、风格和画面细节。</p>
            </div>
          </article>
          <article>
            <span>02</span>
            <i class="ti ti-photo-plus"></i>
            <div>
              <strong>附带参考图</strong>
              <p>需要改图时，直接上传或使用上一张结果。</p>
            </div>
          </article>
          <article>
            <span>03</span>
            <i class="ti ti-sparkles"></i>
            <div>
              <strong>生成与修改</strong>
              <p>生成后可放大、下载，也可以继续基于图片修改。</p>
            </div>
          </article>
        </div>
      </section>

    </div>
  `,
}
