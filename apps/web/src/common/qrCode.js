export async function createQRCodeDataUrl(text) {
  const content = String(text || '').trim()
  if (!content) return ''
  if (/^data:image\//i.test(content) || /^blob:/i.test(content) || content.startsWith('/')) return content

  if (!window.QRCode?.toDataURL) {
    throw new Error('QRCode generator is not loaded')
  }

  return window.QRCode.toDataURL(content, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 260,
  })
}
