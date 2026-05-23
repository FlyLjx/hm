import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound, LogIn, MailCheck, UserPlus, X } from 'lucide-react'
import { clientApi, type CurrentUser } from '../api/clientApi'
import { saveCurrentUser } from '../lib/currentUser'

type AuthMode = 'login' | 'register' | 'forgot' | 'reset'

type LoginDialogProps = {
  open: boolean
  resetToken?: string | null
  onClose: () => void
  onLoggedIn: (user: CurrentUser) => void
  onResetHandled?: () => void
}

export function LoginDialog({
  open,
  resetToken,
  onClose,
  onLoggedIn,
  onResetHandled,
}: LoginDialogProps) {
  const [mode, setMode] = useState<AuthMode>(resetToken ? 'reset' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (resetToken) {
      setMode('reset')
      setError('')
      setNotice('')
    }
  }, [resetToken])

  if (!open) {
    return null
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setNotice('')
    setLoading(true)

    try {
      if (mode === 'login') {
        const response = await login()
        saveCurrentUser(response.data)
        onLoggedIn(response.data)
        onClose()
        return
      }

      if (mode === 'register') {
        await register()
        setMode('login')
        return
      }

      if (mode === 'forgot') {
        await forgotPassword()
        return
      }

      await resetPassword()
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : '操作失败'
      if (message.includes('已重新发送验证邮件')) {
        setNotice(message)
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }

  const login = async () => {
    if (!email.trim() || !password.trim()) {
      throw new Error('请输入邮箱和密码')
    }

    return clientApi.login({
      email: email.trim(),
      password,
    })
  }

  const register = async () => {
    if (!email.trim() || !password.trim()) {
      throw new Error('请输入邮箱和密码')
    }
    if (password.length < 6) {
      throw new Error('密码至少 6 位')
    }
    if (password !== confirmPassword) {
      throw new Error('两次输入的密码不一致')
    }

    await clientApi.register({
      email: email.trim(),
      password,
    })
    setPassword('')
    setConfirmPassword('')
    setNotice('注册成功。如果系统开启了邮箱验证，请先到邮箱完成验证后再登录。')
  }

  const forgotPassword = async () => {
    if (!email.trim()) {
      throw new Error('请输入注册邮箱')
    }

    await clientApi.forgotPassword(email.trim())
    setNotice('如果该邮箱已注册，重置密码链接会发送到邮箱，请在 30 分钟内完成操作。')
  }

  const resetPassword = async () => {
    if (!resetToken) {
      throw new Error('缺少重置密码令牌')
    }
    if (!password.trim()) {
      throw new Error('请输入新密码')
    }
    if (password.length < 6) {
      throw new Error('密码至少 6 位')
    }
    if (password !== confirmPassword) {
      throw new Error('两次输入的密码不一致')
    }

    await clientApi.resetPassword({ token: resetToken, password })
    setPassword('')
    setConfirmPassword('')
    setMode('login')
    setNotice('密码已重置，请使用新密码登录。')
    onResetHandled?.()
  }

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    setError('')
    setNotice('')
  }

  const titleMap: Record<AuthMode, string> = {
    login: '登录 AIπ',
    register: '注册 AIπ',
    forgot: '找回密码',
    reset: '重置密码',
  }
  const subtitleMap: Record<AuthMode, string> = {
    login: '登录后即可生成图片并扣除账户余额',
    register: '创建账号后即可开始使用',
    forgot: '输入邮箱后接收重置密码链接',
    reset: '请设置一个新的登录密码',
  }

  return (
    <div className="login-overlay" role="dialog" aria-modal="true" aria-label="登录注册">
      <form className="login-dialog" onSubmit={handleSubmit}>
        <div className="login-dialog-header">
          <div>
            <h2>{titleMap[mode]}</h2>
            <p>{subtitleMap[mode]}</p>
          </div>
          <button onClick={onClose} title="关闭" type="button">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {mode !== 'reset' && (
          <div className="auth-tabs">
            <button
              className={mode === 'login' ? 'active' : ''}
              onClick={() => switchMode('login')}
              type="button"
            >
              登录
            </button>
            <button
              className={mode === 'register' ? 'active' : ''}
              onClick={() => switchMode('register')}
              type="button"
            >
              注册
            </button>
          </div>
        )}

        {mode !== 'reset' && (
          <label className="login-field">
            <span>邮箱</span>
            <input
              autoFocus
              onChange={(event) => setEmail(event.target.value)}
              placeholder="请输入邮箱"
              type="email"
              value={email}
            />
          </label>
        )}

        {mode !== 'forgot' && (
          <label className="login-field">
            <span>{mode === 'reset' ? '新密码' : '密码'}</span>
            <input
              autoFocus={mode === 'reset'}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === 'reset' ? '请输入新密码' : '请输入密码'}
              type="password"
              value={password}
            />
          </label>
        )}

        {(mode === 'register' || mode === 'reset') && (
          <label className="login-field">
            <span>确认密码</span>
            <input
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="再次输入密码"
              type="password"
              value={confirmPassword}
            />
          </label>
        )}

        {error && <p className="login-error">{error}</p>}
        {notice && <p className="login-notice">{notice}</p>}

        {mode === 'login' && (
          <button className="login-link" onClick={() => switchMode('forgot')} type="button">
            忘记密码？
          </button>
        )}

        <button className="login-submit" disabled={loading} type="submit">
          {mode === 'login' && <LogIn size={17} aria-hidden="true" />}
          {mode === 'register' && <UserPlus size={17} aria-hidden="true" />}
          {mode === 'forgot' && <MailCheck size={17} aria-hidden="true" />}
          {mode === 'reset' && <KeyRound size={17} aria-hidden="true" />}
          {loading
            ? '处理中'
            : mode === 'login'
              ? '登录'
              : mode === 'register'
                ? '注册'
                : mode === 'forgot'
                  ? '发送邮件'
                  : '重置密码'}
        </button>

        {(mode === 'forgot' || mode === 'reset') && (
          <button className="login-secondary" onClick={() => switchMode('login')} type="button">
            返回登录
          </button>
        )}
      </form>
    </div>
  )
}
