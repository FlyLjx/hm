import { Wallet } from 'lucide-react'

type CreditToastProps = {
  open: boolean
  creditName: string
  cost: number
  balance?: number
}

export function CreditToast({ open, creditName, cost, balance }: CreditToastProps) {
  if (!open) {
    return null
  }

  return (
    <div className="credit-toast" role="status" aria-live="polite">
      <div className="credit-toast-icon">
        <Wallet size={19} aria-hidden="true" />
      </div>
      <div>
        <strong>{creditName}不足</strong>
        <p>
          本次预计扣费 {cost.toFixed(2)} {creditName}
          {balance !== undefined ? `，当前余额 ${balance.toFixed(2)} ${creditName}` : ''}
        </p>
      </div>
    </div>
  )
}
