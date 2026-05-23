import { sideItems } from '../data'
import type { Page } from '../types/app'

type SideRailProps = {
  activePage: Page
  setActivePage: (page: Page) => void
}

export function SideRail({ activePage, setActivePage }: SideRailProps) {
  return (
    <aside className="side-rail" aria-label="快捷导航">
      {sideItems.map((item) => {
        const Icon = item.icon
        return (
          <button
            className={activePage === item.id ? 'active' : ''}
            key={item.id}
            onClick={() => setActivePage(item.id)}
            title={item.label}
            type="button"
          >
            <Icon size={17} aria-hidden="true" />
          </button>
        )
      })}
    </aside>
  )
}
