import { clientApi } from '../common/api.js?v=20260706-lottery-copy-v1'
import { formatDate } from '../common/format.js?v=20260710-shanghai-tz-v1'
import { notifyError, notifySuccess } from '../common/notify.js'

const { computed, onMounted, ref, watch } = Vue

function shortId(value) {
  const id = String(value || '').trim()
  if (!id) return '-'
  return id.length > 14 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id
}

function planText(item) {
  if (isThanksPrize(item)) return '谢谢惠顾'
  return item?.planName || item?.prizeName || item?.name || '订阅奖励'
}

function prizeType(item) {
  return String(item?.prizeType || '').trim() === 'thanks' ? 'thanks' : 'subscription'
}

function isThanksPrize(item) {
  return prizeType(item) === 'thanks'
}

function prizeNameText(item) {
  return isThanksPrize(item) ? '谢谢惠顾' : (item?.name || '订阅奖励')
}

function durationText(days) {
  const value = Number(days || 0)
  return value > 0 ? `${value} 天` : '-'
}

function quotaText(value) {
  const count = Number(value || 0)
  return count > 0 ? `${count} 张` : '按套餐配置'
}

export const LotteryPage = {
  props: ['currentUser'],
  emits: ['login', 'go', 'user-updated'],
  setup(props, { emit }) {
    const loading = ref(false)
    const drawing = ref(false)
    const prizes = ref([])
    const todayRecord = ref(null)
    const drawResult = ref(null)
    const resultOpen = ref(false)
    const error = ref('')

    const userName = computed(() => props.currentUser?.email || '未登录用户')
    const userInitial = computed(() => userName.value.slice(0, 1).toUpperCase())
    const subscription = computed(() => props.currentUser?.subscription || null)
    const activeSubscription = computed(() => Boolean(subscription.value?.isPaid || subscription.value?.tier === 'paid' || (subscription.value?.status === 'active' && subscription.value?.planId)))
    const subscriptionText = computed(() => activeSubscription.value ? (subscription.value?.planName || '会员已开通') : '免费版')
    const availablePrizeCount = computed(() => prizes.value.length)
    const hasTodayRecord = computed(() => Boolean(todayRecord.value?.id))
    const canDraw = computed(() => Boolean(props.currentUser?.id && availablePrizeCount.value > 0 && !hasTodayRecord.value && !drawing.value))
    const todayPrizeText = computed(() => todayRecord.value ? planText(todayRecord.value) : '今日未抽')
    const resultRecord = computed(() => drawResult.value?.record || todayRecord.value || null)
    const resultPrize = computed(() => drawResult.value?.prize || null)
    const resultWon = computed(() => {
      if (drawResult.value && typeof drawResult.value.won === 'boolean') return drawResult.value.won
      return Boolean(resultRecord.value) && !isThanksPrize(resultRecord.value)
    })
    const todayWon = computed(() => Boolean(todayRecord.value) && !isThanksPrize(todayRecord.value))
    const resultTitle = computed(() => {
      if (drawResult.value?.drawnToday) return '今日已抽过'
      return resultWon.value ? '抽奖成功' : '谢谢参与'
    })
    const resultMessage = computed(() => {
      if (drawResult.value?.message) return drawResult.value.message
      return resultWon.value ? '订阅权益已处理' : '今天没有抽中订阅，明天再来试试'
    })

    async function loadLottery() {
      if (!props.currentUser?.id) {
        prizes.value = []
        todayRecord.value = null
        error.value = ''
        return
      }
      loading.value = true
      error.value = ''
      try {
        const response = await clientApi.getSubscriptionLottery(props.currentUser.id)
        const data = response.data || {}
        prizes.value = Array.isArray(data.prizes) ? data.prizes : []
        todayRecord.value = data.todayRecord || null
      } catch (err) {
        error.value = err.message || '抽奖信息加载失败'
        notifyError(err, '抽奖信息加载失败')
      } finally {
        loading.value = false
      }
    }

    async function drawLottery() {
      if (!props.currentUser?.id) {
        emit('login')
        return
      }
      if (hasTodayRecord.value) {
        notifySuccess('今天已经抽过了，明天再来')
        return
      }
      if (!availablePrizeCount.value) {
        notifyError(new Error('暂无可用抽奖奖品'))
        return
      }
      drawing.value = true
      try {
        const response = await clientApi.drawSubscriptionLottery(props.currentUser.id)
        const data = response.data || {}
        drawResult.value = data.result || null
        todayRecord.value = data.result?.record || todayRecord.value
        if (data.user) emit('user-updated', data.user)
        resultOpen.value = true
        notifySuccess(data.result?.message || '抽奖完成')
        await loadLottery()
      } catch (err) {
        notifyError(err, '抽奖失败')
      } finally {
        drawing.value = false
      }
    }

    function goChat() {
      emit('go', 'chat')
    }

    onMounted(loadLottery)
    watch(() => props.currentUser?.id || '', loadLottery)

    return {
      loading,
      drawing,
      prizes,
      todayRecord,
      drawResult,
      resultOpen,
      error,
      userName,
      userInitial,
      activeSubscription,
      subscriptionText,
      availablePrizeCount,
      hasTodayRecord,
      canDraw,
      todayPrizeText,
      resultRecord,
      resultPrize,
      resultWon,
      todayWon,
      resultTitle,
      resultMessage,
      loadLottery,
      drawLottery,
      goChat,
      isThanksPrize,
      prizeNameText,
      shortId,
      planText,
      durationText,
      quotaText,
      formatDate,
    }
  },
  template: `
    <div class="lottery-page">
      <section v-if="!currentUser" class="auth-required-panel lottery-auth">
        <i class="ti ti-gift"></i>
        <strong>登录后参与抽订阅</strong>
        <p>每天一次机会，中奖套餐会自动叠加到当前账号。</p>
        <button class="auth-required-button" type="button" @click="$emit('login')">去登录</button>
      </section>

      <main v-else class="lottery-main">
        <section class="lottery-hero">
          <div class="lottery-hero-copy">
            <span>SUBSCRIPTION LOTTERY</span>
            <h2>抽订阅</h2>
            <p>每天一次机会，中奖套餐会自动叠加到当前账号。</p>
            <div class="lottery-hero-actions">
              <button class="lottery-primary" type="button" :disabled="!canDraw" @click="drawLottery">
                <i :class="['ti', drawing ? 'ti-loader-2 is-spinning' : 'ti-gift']"></i>
                {{ drawing ? '抽取中' : (hasTodayRecord ? '今日已抽' : '立即抽奖') }}
              </button>
              <button class="lottery-secondary" type="button" :disabled="loading" @click="loadLottery">
                <i :class="['ti', 'ti-refresh', { 'is-spinning': loading }]"></i>
                刷新奖池
              </button>
            </div>
          </div>
          <div class="lottery-account">
            <span class="lottery-avatar">{{ userInitial }}</span>
            <div>
              <small>当前账号</small>
              <strong>{{ userName }}</strong>
              <em>{{ subscriptionText }}</em>
            </div>
          </div>
        </section>

        <section v-if="error" class="lottery-error">
          <i class="ti ti-alert-circle"></i>
          <span>{{ error }}</span>
          <button type="button" @click="loadLottery">重新加载</button>
        </section>

        <section class="lottery-grid">
          <main class="lottery-stage">
            <article class="lottery-draw-card">
              <div class="lottery-orbit" :class="{ drawing }">
                <span></span>
                <span></span>
                <span></span>
                <div class="lottery-core">
                  <i class="ti ti-crown"></i>
                  <strong>{{ hasTodayRecord ? '今日已抽' : '今日机会' }}</strong>
                  <small>{{ hasTodayRecord ? todayPrizeText : '点击抽取今日结果' }}</small>
                </div>
              </div>
              <div class="lottery-draw-meta">
                <div>
                  <span>可抽奖品</span>
                  <strong>{{ availablePrizeCount }} 个</strong>
                </div>
                <div>
                  <span>今日状态</span>
                  <strong>{{ hasTodayRecord ? '已参与' : '可参与' }}</strong>
                </div>
                <div>
                  <span>账号 ID</span>
                  <strong>{{ shortId(currentUser.id) }}</strong>
                </div>
              </div>
            </article>

            <article class="lottery-panel lottery-today">
              <header class="lottery-panel-head">
                <div>
                  <h3><i class="ti ti-calendar-check"></i>今日抽奖</h3>
                  <p>同一账号每天只能抽一次，次日自动恢复。</p>
                </div>
              </header>
              <div v-if="todayRecord" class="lottery-today-record">
                <span><i :class="['ti', todayWon ? 'ti-confetti' : 'ti-mood-smile']"></i></span>
                <div>
                  <small>今日结果</small>
                  <strong>{{ planText(todayRecord) }}</strong>
                  <em>{{ todayWon ? durationText(todayRecord.durationDays) + ' · ' : '' }}{{ formatDate(todayRecord.createdAt) }}</em>
                </div>
              </div>
              <div v-else class="lottery-empty-inline">
                <i class="ti ti-ticket"></i>
                <span>今天还没有抽奖记录</span>
              </div>
            </article>
          </main>

          <aside class="lottery-side">
            <article class="lottery-panel">
              <header class="lottery-panel-head">
                <div>
                  <h3><i class="ti ti-gift"></i>当前奖池</h3>
                  <p>只展示当前可抽取订阅，未中奖会显示谢谢惠顾。</p>
                </div>
                <span>{{ prizes.length }} 项</span>
              </header>
              <div v-if="prizes.length" class="lottery-prize-list">
                <div v-for="item in prizes" :key="item.id" class="lottery-prize-row" :class="{ thanks: isThanksPrize(item) }">
                  <span><i :class="['ti', isThanksPrize(item) ? 'ti-mood-smile' : 'ti-crown']"></i></span>
                  <div>
                    <strong>{{ prizeNameText(item) }}</strong>
                    <small v-if="!isThanksPrize(item)">{{ item.planName || '订阅套餐' }} · {{ durationText(item.durationDays) }} · {{ quotaText(item.quotaImages) }}</small>
                  </div>
                  <em v-if="!isThanksPrize(item)">全站 {{ item.monthlyText || '本月不限' }}</em>
                </div>
              </div>
              <div v-else class="lottery-empty">
                <i class="ti ti-gift-off"></i>
                <strong>暂无可抽奖品</strong>
                <p>后台还没有启用抽奖奖品，配置后这里会自动显示。</p>
              </div>
            </article>

            <article class="lottery-panel lottery-rule">
              <header class="lottery-panel-head">
                <div>
                  <h3><i class="ti ti-list-check"></i>规则说明</h3>
                </div>
              </header>
              <ul>
                <li><i class="ti ti-circle-check-filled"></i>每个账号每天可抽一次。</li>
                <li><i class="ti ti-circle-check-filled"></i>中奖后订阅会自动发放或顺延。</li>
                <li><i class="ti ti-circle-check-filled"></i>未中奖会记录为谢谢惠顾，不发放订阅。</li>
              </ul>
              <button type="button" @click="goChat">
                <i class="ti ti-message-2"></i>
                去生图
              </button>
            </article>
          </aside>
        </section>
      </main>

      <el-dialog v-model="resultOpen" width="420px" class="lottery-result-dialog" custom-class="lottery-result-panel">
        <template #header>
          <div class="lottery-result-head">
            <span :class="{ thanks: !resultWon }"><i :class="['ti', resultWon ? 'ti-confetti' : 'ti-mood-smile']"></i></span>
            <div>
              <strong>{{ resultTitle }}</strong>
              <p>{{ resultMessage }}</p>
            </div>
          </div>
        </template>
        <div class="lottery-result-body">
          <div class="lottery-result-prize" :class="{ thanks: !resultWon }">
            <small>{{ resultWon ? '获得权益' : '抽奖结果' }}</small>
            <strong>{{ planText(resultPrize || resultRecord) }}</strong>
            <span v-if="resultWon">{{ durationText((resultPrize || resultRecord)?.durationDays) }} · {{ quotaText(resultPrize?.quotaImages) }}</span>
            <span v-else>今天没有抽中订阅，明天再来试试</span>
          </div>
          <div v-if="resultRecord" class="lottery-result-record">
            <span>抽奖日期</span>
            <strong>{{ resultRecord.drawDate || '-' }}</strong>
            <span>发放时间</span>
            <strong>{{ formatDate(resultRecord.createdAt) }}</strong>
          </div>
        </div>
        <template #footer>
          <button class="lottery-secondary" type="button" @click="resultOpen = false">知道了</button>
          <button class="lottery-primary" type="button" @click="resultOpen = false; goChat()">去生图</button>
        </template>
      </el-dialog>
    </div>
  `,
}
