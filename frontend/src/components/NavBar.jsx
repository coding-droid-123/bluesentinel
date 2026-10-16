import React from 'react'
import logo from '../assets/logo.png'

/**
 * Global Navigation Bar Component for Blue Sentinel
 *
 * @param {Object} props
 * @param {string} props.page - Current active page identifier ('home', 'dashboard', 'rov', 'optimizer', 'history', 'about')
 * @param {Function} props.onNavigate - Navigation callback function
 * @param {Function} [props.onClear] - Optional reset/clear callback when clicking logo or Home
 */
export default function NavBar({ page = 'home', onNavigate, onClear }) {
  const handleHomeClick = () => {
    if (onNavigate) {
      onNavigate('home')
    }
  }

  const handleNav = (targetPage) => {
    if (onNavigate) {
      onNavigate(targetPage)
    }
  }

  const isHomeActive = page === 'home' || page === 'dashboard'

  return (
    <nav className="home-nav" aria-label="Main navigation">
      <div className="home-nav-inner" style={{ justifyContent: 'space-between' }}>
        <button
          type="button"
          className="home-logo"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          onClick={handleHomeClick}
          aria-label="Blue Sentinel home"
        >
          <img src={logo} alt="Blue Sentinel Logo" className="home-logo-img" />
          <span className="home-logo-text">Blue Sentinel</span>
        </button>

        <div className="home-nav-links" role="menubar">
          <button
            type="button"
            role="menuitem"
            className={`home-nav-link ${isHomeActive ? 'home-nav-link-active' : ''}`}
            onClick={() => handleNav('home')}
            aria-current={isHomeActive ? 'page' : undefined}
          >
            Home
          </button>
          <button
            type="button"
            role="menuitem"
            className={`home-nav-link ${page === 'rov' ? 'home-nav-link-active' : ''}`}
            onClick={() => handleNav('rov')}
            aria-current={page === 'rov' ? 'page' : undefined}
          >
            ROV Simulator
          </button>
          <button
            type="button"
            role="menuitem"
            className={`home-nav-link ${page === 'optimizer' ? 'home-nav-link-active' : ''}`}
            onClick={() => handleNav('optimizer')}
            aria-current={page === 'optimizer' ? 'page' : undefined}
          >
            Optimizer
          </button>
          <button
            type="button"
            role="menuitem"
            className={`home-nav-link ${page === 'history' ? 'home-nav-link-active' : ''}`}
            onClick={() => handleNav('history')}
            aria-current={page === 'history' ? 'page' : undefined}
          >
            History
          </button>
          <button
            type="button"
            role="menuitem"
            className={`home-nav-link ${page === 'about' ? 'home-nav-link-active' : ''}`}
            onClick={() => handleNav('about')}
            aria-current={page === 'about' ? 'page' : undefined}
          >
            About
          </button>
        </div>
      </div>
    </nav>
  )
}
