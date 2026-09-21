import React, { useRef, useCallback } from 'react'
import logo from '../assets/logo.png'

export default function HomePage({ onFileSelect, user, onShowAuth, onNavigate, onLogout }) {
  const fileInputRef = useRef(null)

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      const file = e.dataTransfer.files?.[0]
      if (file && file.type.startsWith('image/')) onFileSelect(file)
    },
    [onFileSelect]
  )

  const handleDragOver = (e) => e.preventDefault()

  const handleInputChange = (e) => {
    const file = e.target.files?.[0]
    if (file) onFileSelect(file)
  }

  return (
    <div className="home-page">
      {/* ── NAVBAR ── */}
      <nav className="home-nav">
        <div className="home-nav-inner" style={{ justifyContent: 'space-between' }}>
          {/* Logo */}
          <div className="home-logo">
            <img src={logo} alt="Blue Sentinal" className="home-logo-img" />
            <span className="home-logo-text">Blue Sentinal</span>
          </div>

          {/* Nav links + auth */}
          <div className="home-nav-links">
            <button className="home-nav-link" onClick={() => onNavigate('about')}>About</button>
            {user ? (
              <>
                <span className="home-nav-user">👋 {user.name}</span>
                <button className="home-nav-link" onClick={onLogout}>Log Out</button>
              </>
            ) : (
              <>
                <button className="home-nav-link" onClick={() => onShowAuth('login')}>Log In</button>
                <button className="home-nav-btn" onClick={() => onShowAuth('signup')}>Sign Up</button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="home-hero">
        <div className="home-hero-inner">
          <div className="home-badge">
            <span className="home-badge-dot" />
            RTDETR v4 &nbsp;·&nbsp; 69.5% accuracy
          </div>

          <h1 className="home-hero-title">
            Detect what hides
            <br />
            <em className="home-hero-italic">beneath the surface</em>
          </h1>

          <p className="home-hero-desc">
            Upload an underwater photograph and our computer vision model
            will identify, classify, and quantify debris — helping researchers and
            conservationists map ocean pollution.
          </p>

          <div className="home-stats">
            <div className="home-stat">
              <span className="home-stat-value">7K+</span>
              <span className="home-stat-label">Images analyzed</span>
            </div>
            <div className="home-stat">
              <span className="home-stat-value">22</span>
              <span className="home-stat-label">Debris categories</span>
            </div>
            <div className="home-stat">
              <span className="home-stat-value">69.5%</span>
              <span className="home-stat-label">Detection accuracy</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── UPLOAD (logged-in only) OR LOGIN CTA ── */}
      <section className="home-upload-section">
        <div className="home-upload-inner">
          {user ? (
            /* ── Logged in: show real dropzone ── */
            <>
              <div
                className="home-dropzone"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="home-dropzone-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <p className="home-dropzone-title">Drop your underwater photo</p>
                <p className="home-dropzone-sub">or click to browse — JPG, PNG, WebP up to 25MB</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={handleInputChange}
              />
            </>
          ) : (
            /* ── Not logged in: lock gate ── */
            <div className="home-locked-zone">
              <div className="home-locked-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h3 className="home-locked-title">Sign in to start analyzing</h3>
              <p className="home-locked-sub">
                Create a free account or log in to upload underwater images and run debris detection.
              </p>
              <div className="home-locked-actions">
                <button className="home-locked-signup" onClick={() => onShowAuth('signup')}>
                  Sign Up — It's Free
                </button>
                <button className="home-locked-login" onClick={() => onShowAuth('login')}>
                  Log In
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="home-how-section">
        <div className="home-how-inner">
          <p className="home-how-label">METHODOLOGY</p>
          <h2 className="home-how-title">How Blue Sentinal works</h2>

          <div className="home-cards-grid">
            {[
              {
                num: '01',
                title: 'Upload',
                desc: 'Submit any underwater photo — from ROVs, dive cameras, or research vessels. Supports all major formats.',
              },
              {
                num: '02',
                title: 'Detection',
                desc: 'Our RTDETRv4 model scans the frame and draws bounding boxes around identified debris objects.',
              },
              {
                num: '03',
                title: 'Classification',
                desc: 'Each detected object is categorized by material type — plastic, bio , ROV and etc .',
              },
              {
                num: '04',
                title: 'Report',
                desc: 'Download a structured PDF report with confidence scores and severity ratings.',
              },
            ].map((card) => (
              <div key={card.num} className="home-card">
                <span className="home-card-num">{card.num}</span>
                <h3 className="home-card-title">{card.title}</h3>
                <p className="home-card-desc">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="home-footer">
        <p className="home-footer-title">Blue Sentinal — Ocean debris detection for researchers</p>
        <p className="home-footer-sub">Model: RTDETRv4 model &nbsp;·&nbsp; Dataset: Trashcan Datset</p>
      </footer>
    </div>
  )
}
