import { Bell, Search } from 'lucide-react'
import type { CurrentUser } from '../api/clientApi'
import { navItems } from '../data'
import type { Page } from '../types/app'

type TopNavProps = {
  activePage: Page
  creditName: string
  currentUser: CurrentUser | null
  onLoginClick: () => void
  onLogout: () => void
  setActivePage: (page: Page) => void
}

export function TopNav({
  activePage,
  creditName,
  currentUser,
  onLoginClick,
  onLogout,
  setActivePage,
}: TopNavProps) {
  return (
    <header className="top-nav">
      <button className="brand" onClick={() => setActivePage('generate')} type="button">
        <span className="brand-mark">AI</span>
        <strong>AIπ</strong>
      </button>

      <nav className="top-menu" aria-label="主导航">
        {navItems.map((item) => (
          <button
            className={activePage === item.id ? 'active' : ''}
            key={item.id}
            onClick={() => setActivePage(item.id)}
            type="button"
          >
            {item.name}
          </button>
        ))}
      </nav>

      <div className="top-actions">
        <button type="button" title="搜索">
          <Search size={16} aria-hidden="true" />
        </button>
        <button type="button" title="通知">
          <Bell size={16} aria-hidden="true" />
        </button>
        {currentUser ? (
          <div className="user-menu">
            <button className="user-pill" type="button">
              <strong>{currentUser.email}</strong>
              <span>
                {currentUser.credits.toFixed(2)} {creditName}
              </span>
            </button>
            <button className="logout-button" onClick={onLogout} type="button">
              退出
            </button>
          </div>
        ) : (
          <button className="login-button" onClick={onLoginClick} type="button">
            登录
          </button>
        )}
      </div>
    </header>
  )
}
