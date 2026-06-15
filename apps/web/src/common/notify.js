export function notifySuccess(message) {
  antd.message.success(message)
}

export function notifyError(error, fallback = '操作失败') {
  antd.message.error(error?.message || fallback)
}
