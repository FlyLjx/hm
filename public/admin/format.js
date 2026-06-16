export function formatAmount(value, digits = 3) {
  const number = Number(value || 0)
  return number.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: digits })
}

export function formatCurrency(value) {
  const number = Number(value || 0)
  return number.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatDate(value) {
  if (!value) return '-'
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function amount(value) {
  return formatAmount(value)
}

export function money(value) {
  return `¥${formatCurrency(value)}`
}

export function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function text(value) {
  return String(value || '-')
}

export const statusMaps = {
  user: {
    active: { label: '启用', color: 'green' },
    disabled: { label: '禁用', color: 'red' },
  },
  role: {
    admin: { label: '管理员', color: 'blue' },
    user: { label: '用户', color: 'default' },
  },
  task: {
    queued: { label: '等待中', color: 'gold' },
    pending: { label: '等待中', color: 'gold' },
    processing: { label: '创作中', color: 'blue' },
    success: { label: '成功', color: 'green' },
    failed: { label: '失败', color: 'red' },
    canceled: { label: '已取消', color: 'orange' },
  },
  order: {
    pending: { label: '待支付', color: 'gold' },
    paid: { label: '已支付', color: 'green' },
    closed: { label: '已关闭', color: 'default' },
    failed: { label: '失败', color: 'red' },
  },
  orderType: {
    recharge: { label: '充值', color: 'blue' },
    subscription: { label: '订阅', color: 'purple' },
  },
  subscription: {
    none: { label: '无', color: 'default' },
    active: { label: '会员', color: 'gold' },
  },
  common: {
    active: { label: '启用', color: 'green' },
    disabled: { label: '禁用', color: 'red' },
  },
  redeem: {
    active: { label: '可用', color: 'green' },
    used: { label: '已兑换', color: 'default' },
    disabled: { label: '禁用', color: 'red' },
  },
}

export function statusItem(map, value) {
  return statusMaps[map]?.[String(value)] || { label: text(value), color: 'default' }
}

export function creditLogType(value) {
  const map = { recharge: '充值', deduct: '扣减', refund: '退回', adjust: '调整', admin_recharge: '后台充值', admin_deduct: '后台扣减' }
  return map[String(value)] || text(value)
}

export function creditLogTypeItem(value) {
  const map = {
    recharge: { label: '充值', color: 'green' },
    deduct: { label: '扣减', color: 'red' },
    refund: { label: '退回', color: 'blue' },
    adjust: { label: '调整', color: 'gold' },
    admin_recharge: { label: '后台充值', color: 'cyan' },
    admin_deduct: { label: '后台扣减', color: 'orange' },
  }
  return map[String(value)] || { label: text(value), color: 'default' }
}
