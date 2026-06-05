import { AlipaySdk, ProxyAgent } from 'alipay-sdk'
import { env } from '../../config/env.js'
import { AppError } from '../../shared/AppError.js'
import type { SystemSettings } from '../settings/settingTypes.js'

type AlipayPrecreateResponse = {
  code: string
  msg: string
  out_trade_no?: string
  outTradeNo?: string
  qr_code?: string
  qrCode?: string
  sub_code?: string
  subCode?: string
  sub_msg?: string
  subMsg?: string
}

type AlipayQueryResponse = {
  code: string
  msg: string
  trade_no?: string
  tradeNo?: string
  out_trade_no?: string
  outTradeNo?: string
  trade_status?: string
  tradeStatus?: string
  sub_code?: string
  subCode?: string
  sub_msg?: string
  subMsg?: string
}

export class AlipayService {
  createClient(settings: SystemSettings) {
    if (!settings.alipayAppId || !settings.alipayPrivateKey || !settings.alipayPublicKey) {
      throw new AppError(400, '支付宝当面付未配置完整')
    }

    return new AlipaySdk({
      appId: settings.alipayAppId,
      privateKey: settings.alipayPrivateKey,
      alipayPublicKey: settings.alipayPublicKey,
      gateway: settings.alipayGateway,
      keyType: 'PKCS8',
      timeout: env.alipay.timeoutMs,
      ...(env.alipay.proxyUrl ? { proxyAgent: new ProxyAgent(env.alipay.proxyUrl) } : {}),
    })
  }

  async createFaceToFaceOrder(input: {
    settings: SystemSettings
    outTradeNo: string
    amount: number
    subject: string
    notifyOrigin?: string
  }) {
    const client = this.createClient(input.settings)
    const backendUrl = input.notifyOrigin || input.settings.backendUrl
    const notifyUrl = `${backendUrl.replace(/\/$/, '')}/api/recharge/alipay/notify`
    let result: unknown
    try {
      result = await client.exec('alipay.trade.precreate', {
        notify_url: notifyUrl,
        bizContent: {
          out_trade_no: input.outTradeNo,
          total_amount: input.amount.toFixed(2),
          subject: input.subject,
        },
      })
    } catch (error) {
      throw new AppError(
        502,
        `支付宝网关连接超时或不可用，请检查服务器是否能访问 openapi.alipay.com，或配置 ALIPAY_PROXY_URL。${error instanceof Error ? `原始错误：${error.message}` : ''}`,
      )
    }

    const data = result as AlipayPrecreateResponse
    const qrCode = data.qr_code ?? data.qrCode
    if (data.code !== '10000' || !qrCode) {
      throw new AppError(502, data.sub_msg || data.subMsg || data.msg || '支付宝预创建订单失败')
    }

    return {
      qrCode,
    }
  }

  async queryOrder(settings: SystemSettings, outTradeNo: string) {
    const client = this.createClient(settings)
    let result: unknown
    try {
      result = await client.exec('alipay.trade.query', {
        bizContent: {
          out_trade_no: outTradeNo,
        },
      })
    } catch {
      return {
        paid: false,
        tradeStatus: '支付宝网关连接失败',
        tradeNo: null,
      }
    }

    const data = result as AlipayQueryResponse
    if (data.code !== '10000') {
      return {
        paid: false,
        tradeStatus: data.sub_code || data.subCode || data.msg,
        tradeNo: data.trade_no ?? data.tradeNo ?? null,
      }
    }
    const tradeStatus = data.trade_status ?? data.tradeStatus ?? ''

    return {
      paid: tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED',
      tradeStatus,
      tradeNo: data.trade_no ?? data.tradeNo ?? null,
    }
  }

  verifyNotify(settings: SystemSettings, payload: Record<string, unknown>) {
    const client = this.createClient(settings)
    return client.checkNotifySignV2(payload)
  }
}
