import { useEffect, useState } from 'react'
import type { CurrentUser } from './api/clientApi'
import { clientApi } from './api/clientApi'
import { LoginDialog } from './components/LoginDialog'
import { SideRail } from './components/SideRail'
import { TopNav } from './components/TopNav'
import { clearCurrentUser, getCurrentUser } from './lib/currentUser'
import { ChatImagePage } from './pages/ChatImagePage'
import { GeneratePage } from './pages/GeneratePage'
import { PlazaPage } from './pages/PlazaPage'
import { VideoPage } from './pages/VideoPage'
import { WorkflowCanvasPage } from './pages/WorkflowCanvasPage'
import type { Page } from './types/app'
import './App.css'

const pageSet = new Set<Page>(['chat', 'generate', 'plaza', 'canvas', 'video'])

function getPageFromHash(): Page {
  const page = window.location.hash.replace('#/', '') as Page
  return pageSet.has(page) ? page : 'generate'
}

function removeQueryToken(tokenName: string) {
  const params = new URLSearchParams(window.location.search)
  params.delete(tokenName)
  const nextSearch = params.toString()
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`,
  )
}

function App() {
  const initialResetToken = new URLSearchParams(window.location.search).get('resetPasswordToken')
  const [activePage, setActivePageState] = useState<Page>(getPageFromHash)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => getCurrentUser())
  const [loginOpen, setLoginOpen] = useState(Boolean(initialResetToken))
  const [creditName, setCreditName] = useState('积分')
  const [resetPasswordToken, setResetPasswordToken] = useState<string | null>(initialResetToken)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const isImmersivePage = activePage === 'canvas'

  useEffect(() => {
    const syncPageFromHash = () => setActivePageState(getPageFromHash())
    window.addEventListener('hashchange', syncPageFromHash)
    return () => window.removeEventListener('hashchange', syncPageFromHash)
  }, [])

  useEffect(() => {
    const userId = currentUser?.id
    if (!userId) {
      return
    }

    let ignore = false
    const checkUserStatus = async () => {
      try {
        const response = await clientApi.getCurrentUser(userId)
        if (ignore) return
        setCurrentUser(response.data)
      } catch {
        if (ignore) return
        clearCurrentUser()
        setCurrentUser(null)
        setLoginOpen(true)
      }
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void checkUserStatus()
      }
    }

    void checkUserStatus()
    const timer = window.setInterval(checkUserStatus, 30000)
    window.addEventListener('focus', checkUserStatus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      ignore = true
      window.clearInterval(timer)
      window.removeEventListener('focus', checkUserStatus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [currentUser?.id])

  useEffect(() => {
    let ignore = false
    clientApi
      .getSettings()
      .then((response) => {
        if (!ignore) {
          setCreditName(response.data.creditName || '积分')
        }
      })
      .catch(() => {
        if (!ignore) {
          setCreditName('积分')
        }
      })

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const verifyToken = params.get('verifyEmailToken')

    if (verifyToken) {
      clientApi
        .verifyEmail(verifyToken)
        .then(() => {
          setNotice({ type: 'success', text: '邮箱验证成功，请登录。' })
        })
        .catch((error) => {
          setNotice({
            type: 'error',
            text: error instanceof Error ? error.message : '邮箱验证失败',
          })
        })
        .finally(() => {
          removeQueryToken('verifyEmailToken')
          setLoginOpen(true)
        })
    }
  }, [])

  const setActivePage = (page: Page) => {
    window.location.hash = `/${page}`
    setActivePageState(page)
  }

  const handleLogout = () => {
    clearCurrentUser()
    setCurrentUser(null)
  }

  return (
    <main className="app-shell">
      {!isImmersivePage && (
        <>
          <TopNav
            activePage={activePage}
            creditName={creditName}
            currentUser={currentUser}
            onLoginClick={() => setLoginOpen(true)}
            onLogout={handleLogout}
            setActivePage={setActivePage}
          />
          <SideRail activePage={activePage} setActivePage={setActivePage} />
        </>
      )}

      <section className={isImmersivePage ? 'page-surface canvas-surface' : 'page-surface'}>
        {activePage === 'chat' && (
          <ChatImagePage
            key={currentUser?.id ?? 'guest'}
            creditName={creditName}
            currentUser={currentUser}
            onRequireLogin={() => setLoginOpen(true)}
            onUserUpdated={setCurrentUser}
          />
        )}
        {activePage === 'generate' && (
          <GeneratePage
            creditName={creditName}
            currentUser={currentUser}
            onRequireLogin={() => setLoginOpen(true)}
            onUserUpdated={setCurrentUser}
          />
        )}
        {activePage === 'plaza' && <PlazaPage />}
        {activePage === 'canvas' && <WorkflowCanvasPage setActivePage={setActivePage} />}
        {activePage === 'video' && <VideoPage />}
      </section>

      {notice && (
        <div
          className={`notice-toast ${notice.type}`}
          role="status"
          onAnimationEnd={() => window.setTimeout(() => setNotice(null), 3000)}
        >
          <strong>{notice.type === 'success' ? '提示' : '错误'}</strong>
          <p>{notice.text}</p>
        </div>
      )}

      <LoginDialog
        key={resetPasswordToken ?? 'auth'}
        open={loginOpen}
        resetToken={resetPasswordToken}
        onClose={() => setLoginOpen(false)}
        onLoggedIn={setCurrentUser}
        onResetHandled={() => {
          removeQueryToken('resetPasswordToken')
          setResetPasswordToken(null)
        }}
      />
    </main>
  )
}

export default App
