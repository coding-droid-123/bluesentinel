import React, { useState } from 'react'

export default function AuthModal({ mode = 'login', onClose, onSuccess }) {
  const [tab, setTab] = useState(mode) // 'login' | 'signup'
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')

  const handle = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
    setError('')
  }

  const submit = (e) => {
    e.preventDefault()
    if (!form.email || !form.password) { setError('Please fill in all fields.'); return }
    if (tab === 'signup' && !form.name) { setError('Please enter your name.'); return }
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return }
    // Frontend-only auth — just mark user as logged in
    onSuccess({ name: form.name || form.email.split('@')[0], email: form.email })
  }

  return (
    <div className="auth-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="auth-modal">
        {/* Close */}
        <button className="auth-close" onClick={onClose} aria-label="Close">✕</button>

        {/* Logo */}
        <div className="auth-logo">
          <div className="home-logo-icon" style={{ width: 40, height: 40 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <span className="auth-logo-text">Blue Sentinal</span>
        </div>

        {/* Tabs */}
        <div className="auth-tabs">
          <button className={`auth-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => { setTab('login'); setError('') }}>Log In</button>
          <button className={`auth-tab ${tab === 'signup' ? 'active' : ''}`} onClick={() => { setTab('signup'); setError('') }}>Sign Up</button>
        </div>

        <p className="auth-subtitle">
          {tab === 'login'
            ? 'Welcome back. Sign in to analyze underwater images.'
            : 'Create an account to start detecting marine debris.'}
        </p>

        <form onSubmit={submit} className="auth-form">
          {tab === 'signup' && (
            <div className="auth-field">
              <label className="auth-label">Full Name</label>
              <input
                className="auth-input"
                type="text"
                name="name"
                placeholder="Jane Doe"
                value={form.name}
                onChange={handle}
                autoComplete="name"
              />
            </div>
          )}
          <div className="auth-field">
            <label className="auth-label">Email</label>
            <input
              className="auth-input"
              type="email"
              name="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handle}
              autoComplete="email"
            />
          </div>
          <div className="auth-field">
            <label className="auth-label">Password</label>
            <input
              className="auth-input"
              type="password"
              name="password"
              placeholder="••••••••"
              value={form.password}
              onChange={handle}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="auth-submit">
            {tab === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <p className="auth-switch">
          {tab === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button className="auth-switch-btn" onClick={() => { setTab(tab === 'login' ? 'signup' : 'login'); setError('') }}>
            {tab === 'login' ? 'Sign Up' : 'Log In'}
          </button>
        </p>
      </div>
    </div>
  )
}
