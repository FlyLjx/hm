import { clientApi } from '../common/api.js'
import { formatDate } from '../common/format.js?v=20260710-shanghai-tz-v1'
import { notifyError, notifySuccess } from '../common/notify.js'

const { computed, onMounted, ref, watch } = Vue

function shortId(value) {
  const id = String(value || '').trim()
  if (!id) return ''
  return id.length > 14 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id
}

function personName(email, id, fallback = '未知用户') {
  return String(email || '').trim() || shortId(id) || fallback
}

function personInitial(email, id) {
  const text = personName(email, id, 'U')
  return text.slice(0, 1).toUpperCase()
}

function numberText(value) {
  return Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

export const InvitePage = {
  props: ['currentUser', 'siteName'],
  emits: ['login', 'go'],
  setup(props, { emit }) {
    const loading = ref(false)
    const summary = ref(null)
    const error = ref('')

    const userName = computed(() => props.currentUser?.email || '未登录用户')
    const userInitial = computed(() => userName.value.slice(0, 1).toUpperCase())
    const inviteCode = computed(() => String(summary.value?.inviteCode || props.currentUser?.inviteCode || '').trim().toUpperCase())
    const inviteUrl = computed(() => {
      if (!inviteCode.value) return ''
      const url = new URL(location.origin)
      url.searchParams.set('invite', inviteCode.value)
      return url.toString()
    })
    const records = computed(() => Array.isArray(summary.value?.records) ? summary.value.records : [])
    const receivedInvite = computed(() => summary.value?.receivedInvite || null)
    const totalInvites = computed(() => Number(summary.value?.total || summary.value?.inviteCount || 0))
    const rewardCount = computed(() => Number(summary.value?.totalSubscriptionRewards || 0))
    const rewardText = computed(() => summary.value?.rewardText || summary.value?.rewardPlanName || '订阅权益')
    const rewardTypeText = computed(() => summary.value?.rewardType === 'credits' ? '积分奖励' : '订阅奖励')
    const hasRewardPlan = computed(() => Boolean(summary.value?.rewardPlanId || summary.value?.rewardPlanName))

    async function loadInviteSummary() {
      if (!props.currentUser?.id) {
        summary.value = null
        error.value = ''
        return
      }
      loading.value = true
      error.value = ''
      try {
        const response = await clientApi.getInviteSummary(props.currentUser.id)
        summary.value = response.data || {}
      } catch (err) {
        error.value = err.message || '邀请信息加载失败'
        notifyError(err, '邀请信息加载失败')
      } finally {
        loading.value = false
      }
    }

    async function copyText(text, successMessage) {
      if (!text) return
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text)
        } else {
          const textarea = document.createElement('textarea')
          textarea.value = text
          textarea.setAttribute('readonly', '')
          textarea.style.position = 'fixed'
          textarea.style.opacity = '0'
          document.body.appendChild(textarea)
          textarea.select()
          document.execCommand('copy')
          document.body.removeChild(textarea)
        }
        notifySuccess(successMessage)
      } catch (err) {
        notifyError(err, '复制失败')
      }
    }

    function copyInviteLink() {
      if (!props.currentUser?.id) {
        emit('login')
        return
      }
      if (!inviteCode.value) {
        notifyError(new Error('邀请码生成中，请稍后刷新'))
        return
      }
      copyText(inviteUrl.value, '邀请链接已复制')
    }

    function copyInviteCode() {
      if (!props.currentUser?.id) {
        emit('login')
        return
      }
      if (!inviteCode.value) {
        notifyError(new Error('邀请码生成中，请稍后刷新'))
        return
      }
      copyText(inviteCode.value, '邀请码已复制')
    }

    function copyInviteMessage() {
      if (!inviteCode.value) {
        notifyError(new Error('邀请码生成中，请稍后刷新'))
        return
      }
      const site = props.siteName || 'AI-PAI'
      const text = `${site} 可以对话生图、参考图改图和保存作品。用我的邀请链接注册即可开始体验：${inviteUrl.value}`
      copyText(text, '邀请文案已复制')
    }

    function rewardLabel(item) {
      if (!item) return '-'
      if ((item.rewardType || 'subscription') === 'credits') {
        const credits = Number(item.rewardCredits || 0)
        return credits > 0 ? `${numberText(credits)} 积分` : (item.rewardLabel || '积分奖励')
      }
      return item.rewardLabel || rewardText.value || '订阅权益'
    }

    function rewardTypeLabel(item) {
      if ((item?.rewardType || 'subscription') === 'credits') return '积分'
      return '订阅'
    }

    function inviteeName(item) {
      return personName(item?.inviteeEmail, item?.inviteeId, '被邀请用户')
    }

    function inviterName(item) {
      return personName(item?.inviterEmail, item?.inviterId, '邀请人')
    }

    function goChat() {
      emit('go', 'chat')
    }

    onMounted(loadInviteSummary)
    watch(() => props.currentUser?.id || '', loadInviteSummary)

    return {
      loading,
      summary,
      error,
      userName,
      userInitial,
      inviteCode,
      inviteUrl,
      records,
      receivedInvite,
      totalInvites,
      rewardCount,
      rewardText,
      rewardTypeText,
      hasRewardPlan,
      loadInviteSummary,
      copyInviteLink,
      copyInviteCode,
      copyInviteMessage,
      rewardLabel,
      rewardTypeLabel,
      inviteeName,
      inviterName,
      personInitial,
      shortId,
      formatDate,
      goChat,
    }
  },
  template: `
    <div class="invite-v2-page">
      <section v-if="!currentUser" class="auth-required-panel invite-v2-auth">
        <i class="ti ti-user-plus"></i>
        <strong>登录后查看邀请中心</strong>
        <p>邀请链接、邀请记录、被邀请信息和赠送权益会跟随你的账号保存。</p>
        <button class="auth-required-button" type="button" @click="$emit('login')">去登录</button>
      </section>

      <main v-else v-loading="loading" class="invite-v2-main">
        <section class="invite-v2-hero">
          <div class="invite-v2-hero-copy">
            <span>INVITE CENTER</span>
            <h2>邀请中心</h2>
            <p>把专属链接发给好友，好友完成注册并通过邮箱验证后，系统才会记录邀请关系并发放对应赠送权益。</p>
            <div class="invite-v2-actions">
              <button class="invite-v2-primary" type="button" @click="copyInviteLink">
                <i class="ti ti-link"></i>
                复制邀请链接
              </button>
              <button class="invite-v2-secondary" type="button" @click="copyInviteMessage">
                <i class="ti ti-message-share"></i>
                复制邀请文案
              </button>
              <button class="invite-v2-ghost" type="button" @click="loadInviteSummary">
                <i :class="['ti', 'ti-refresh', { 'is-spinning': loading }]"></i>
                刷新
              </button>
            </div>
          </div>
          <div class="invite-v2-identity">
            <span class="invite-v2-avatar">{{ userInitial }}</span>
            <div>
              <small>当前账号</small>
              <strong>{{ userName }}</strong>
              <em>邀请码：{{ inviteCode || '生成中' }}</em>
            </div>
          </div>
        </section>

        <section v-if="error" class="invite-v2-error">
          <i class="ti ti-alert-circle"></i>
          <span>{{ error }}</span>
          <button type="button" @click="loadInviteSummary">重新加载</button>
        </section>

        <section class="invite-v2-summary" aria-label="邀请统计">
          <article>
            <span><i class="ti ti-users-plus"></i></span>
            <div>
              <strong>{{ totalInvites }}</strong>
              <small>已验证邀请</small>
            </div>
          </article>
          <article>
            <span class="gold"><i class="ti ti-gift"></i></span>
            <div>
              <strong>{{ rewardCount }}</strong>
              <small>已发放奖励</small>
            </div>
          </article>
          <article>
            <span class="blue"><i class="ti ti-crown"></i></span>
            <div>
              <strong>{{ rewardText }}</strong>
              <small>当前赠送内容</small>
            </div>
          </article>
        </section>

        <section class="invite-v2-grid">
          <main class="invite-v2-content">
            <article class="invite-v2-panel invite-v2-link-panel">
              <header class="invite-v2-panel-head">
                <div>
                  <h3><i class="ti ti-link"></i>专属邀请</h3>
                  <p>好友通过这个链接注册并验证邮箱后，会自动绑定邀请关系。</p>
                </div>
              </header>
              <div class="invite-v2-link-box">
                <div>
                  <span>邀请链接</span>
                  <strong>{{ inviteUrl || '邀请码生成中，稍后刷新' }}</strong>
                </div>
                <button type="button" @click="copyInviteLink">复制</button>
              </div>
              <div class="invite-v2-code-row">
                <span>邀请码</span>
                <strong>{{ inviteCode || '生成中' }}</strong>
                <button type="button" @click="copyInviteCode">复制邀请码</button>
              </div>
            </article>

            <article class="invite-v2-panel invite-v2-records">
              <header class="invite-v2-panel-head">
                <div>
                  <h3><i class="ti ti-list-details"></i>邀请与被邀请记录</h3>
                  <p>仅显示真实注册产生的邀请数据，没有记录时不展示假数据。</p>
                </div>
                <span>{{ records.length }} 条</span>
              </header>

              <div v-if="records.length" class="invite-v2-table">
                <div class="invite-v2-table-head">
                  <span>邀请人</span>
                  <span>被邀请人</span>
                  <span>赠送信息</span>
                  <span>邀请时间</span>
                </div>
                <div v-for="item in records" :key="item.id" class="invite-v2-table-row">
                  <div class="invite-v2-person">
                    <span>{{ personInitial(item.inviterEmail, item.inviterId) }}</span>
                    <div>
                      <strong>{{ inviterName(item) }}</strong>
                      <small>{{ shortId(item.inviterId) }}</small>
                    </div>
                  </div>
                  <div class="invite-v2-person">
                    <span class="soft">{{ personInitial(item.inviteeEmail, item.inviteeId) }}</span>
                    <div>
                      <strong>{{ inviteeName(item) }}</strong>
                      <small>{{ shortId(item.inviteeId) }}</small>
                    </div>
                  </div>
                  <div class="invite-v2-reward">
                    <em>{{ rewardTypeLabel(item) }}</em>
                    <strong>{{ rewardLabel(item) }}</strong>
                  </div>
                  <time>{{ formatDate(item.createdAt) }}</time>
                </div>
              </div>

              <div v-else class="invite-v2-empty">
                <i class="ti ti-user-search"></i>
                <strong>暂无邀请记录</strong>
                  <p>复制邀请链接发给好友，邮箱验证成功后这里会显示邀请人、被邀请人和赠送信息。</p>
              </div>
            </article>
          </main>

          <aside class="invite-v2-side">
            <article class="invite-v2-panel invite-v2-rule">
              <header class="invite-v2-panel-head">
                <div>
                  <h3><i class="ti ti-gift"></i>赠送规则</h3>
                  <p>后台配置的邀请赠送内容会显示在这里。</p>
                </div>
              </header>
              <dl>
                <div>
                  <dt>奖励类型</dt>
                  <dd>{{ rewardTypeText }}</dd>
                </div>
                <div>
                  <dt>赠送内容</dt>
                  <dd>{{ rewardText }}</dd>
                </div>
                <div>
                  <dt>发放时机</dt>
                  <dd>好友邮箱验证成功后自动发放</dd>
                </div>
              </dl>
              <p v-if="!hasRewardPlan" class="invite-v2-muted">后台暂未选择具体订阅套餐，当前显示为通用订阅权益。</p>
            </article>

            <article class="invite-v2-panel invite-v2-received">
              <header class="invite-v2-panel-head">
                <div>
                  <h3><i class="ti ti-user-check"></i>我的邀请来源</h3>
                  <p>如果你是通过邀请注册，这里会显示邀请人和奖励信息。</p>
                </div>
              </header>
              <div v-if="receivedInvite" class="invite-v2-received-card">
                <div class="invite-v2-person">
                  <span>{{ personInitial(receivedInvite.inviterEmail, receivedInvite.inviterId) }}</span>
                  <div>
                    <strong>{{ inviterName(receivedInvite) }}</strong>
                    <small>邀请人 ID：{{ shortId(receivedInvite.inviterId) }}</small>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>被邀请人</dt>
                    <dd>{{ inviteeName(receivedInvite) }}</dd>
                  </div>
                  <div>
                    <dt>赠送信息</dt>
                    <dd>{{ rewardLabel(receivedInvite) }}</dd>
                  </div>
                  <div>
                    <dt>绑定时间</dt>
                    <dd>{{ formatDate(receivedInvite.createdAt) }}</dd>
                  </div>
                </dl>
              </div>
              <div v-else class="invite-v2-side-empty">
                <i class="ti ti-user-off"></i>
                <span>当前账号没有邀请来源记录</span>
              </div>
            </article>

            <article class="invite-v2-panel invite-v2-guide">
              <header class="invite-v2-panel-head">
                <div>
                  <h3><i class="ti ti-route"></i>邀请流程</h3>
                </div>
              </header>
              <ol>
                <li><span>1</span>复制邀请链接</li>
                <li><span>2</span>好友完成注册</li>
                <li><span>3</span>系统记录关系并发放赠送权益</li>
              </ol>
              <button type="button" @click="goChat">
                <i class="ti ti-message-2"></i>
                去生图页面
              </button>
            </article>
          </aside>
        </section>
      </main>
    </div>
  `,
}
