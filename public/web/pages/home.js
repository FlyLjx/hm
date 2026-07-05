import { renderMarkdown } from '../common/markdown.js'

const { computed } = Vue

export const HomePage = {
  props: ['announcements', 'currentUser', 'settings', 'siteName', 'subscriptionPlans'],
  emits: ['announcement-close', 'go', 'invite', 'login', 'recharge', 'subscribe'],
  setup(props) {
    const visibleAnnouncements = computed(() => (props.announcements || []).slice(0, 3))

    function announcementHtml(item) {
      return renderMarkdown(item?.content || '')
    }

    return { visibleAnnouncements, announcementHtml }
  },
  template: `
    <div class="ai-pai-home">
      <section class="ai-pai-home-stage">
        <div class="ai-pai-home-shell">
          <div v-if="visibleAnnouncements.length" class="ai-pai-home-announcements">
            <article v-for="item in visibleAnnouncements" :key="item.id" class="ai-pai-home-announcement">
              <i class="ti ti-speakerphone"></i>
              <div>
                <strong>{{ item.title || '平台公告' }}</strong>
                <div class="ai-pai-home-announcement-content" v-html="announcementHtml(item)"></div>
              </div>
              <button type="button" title="关闭公告" aria-label="关闭公告" @click.stop="$emit('announcement-close', item)">
                <i class="ti ti-x"></i>
              </button>
            </article>
          </div>

          <div class="ai-pai-home-copy">
            <span class="ai-pai-home-kicker">AI IMAGE CREATOR</span>
            <h1>ai-pai</h1>
            <p>用 AI 生成高质量图片，进入对话生图后选择模型、比例和参数继续创作。</p>
          </div>

          <button class="ai-pai-start-button" type="button" @click.stop="$emit('go', 'chat')">
            <i class="ti ti-sparkles"></i>
            开始生图
          </button>
        </div>
      </section>
    </div>
  `,
}
