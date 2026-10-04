import React, { useRef, useCallback } from 'react'
import logo from '../assets/logo.png'

export default function HomePage({ onFileSelect, onNavigate }) {
  const fileInputRef = useRef(null)

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) onFileSelect(file)
  }, [onFileSelect])

  const handleDragOver = (e) => e.preventDefault()
  const handleInputChange = (e) => {
    const file = e.target.files?.[0]
    if (file) onFileSelect(file)
  }

  return (
    <div className="home-page">
      {/* NAV */}
      <nav className="home-nav">
        <div className="home-nav-inner" style={{ justifyContent: 'space-between' }}>
          <div className="home-logo">
            <img src={logo} alt="Blue Sentinel" className="home-logo-img" />
            <span className="home-logo-text">Blue Sentinel</span>
          </div>
          <div className="home-nav-links">
            <button className="home-nav-link home-nav-link-active">Home</button>
            <button className="home-nav-link" onClick={() => onNavigate('rov')}>ROV Simulator</button>
            <button className="home-nav-link" onClick={() => onNavigate('optimizer')}>Optimizer</button>
            <button className="home-nav-link" onClick={() => onNavigate('about')}>About</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="home-hero">
        <div className="home-hero-inner">
          <div className="home-badge">
            <span className="home-badge-dot" />
            RT-DETRv4 &nbsp;&middot;&nbsp; 69.5% mAP &nbsp;&middot;&nbsp; Scale-Up v2
          </div>
          <h1 className="home-hero-title">
            Detect what hides<br />
            <em className="home-hero-italic">beneath the surface</em>
          </h1>
          <p className="home-hero-desc">
            Upload an underwater photograph for instant debris detection with bounding boxes
            and confidence scores, or use the ROV Simulator to stream live video through
            the backend with real-time alerts and pile ranking.
          </p>
          <div className="home-stats">
            <div className="home-stat">
              <span className="home-stat-value">7K+</span>
              <span className="home-stat-label">Training images</span>
            </div>
            <div className="home-stat">
              <span className="home-stat-value">22</span>
              <span className="home-stat-label">Debris categories</span>
            </div>
            <div className="home-stat">
              <span className="home-stat-value">69.5%</span>
              <span className="home-stat-label">Detection mAP</span>
            </div>
            <div className="home-stat">
              <span className="home-stat-value">3</span>
              <span className="home-stat-label">Alert trigger types</span>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURE CARDS */}
      <section style={{ background: '#ddeaf2', padding: '40px 32px 0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p className="home-how-label">CAPABILITIES</p>
          <h2 className="home-how-title" style={{ marginBottom: 20 }}>What Blue Sentinel 2.0 can do</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
            {[
              {
                icon: '🎯',
                title: 'Still Image Detection',
                desc: 'Upload any underwater photo. RT-DETRv4 draws bounding boxes with class names and confidence scores, then generates a PDF audit report.',
                btn: 'Analyze Image',
                action: () => fileInputRef.current?.click(),
                accent: '#1e8a5e',
              },
              {
                icon: '🎥',
                title: 'ROV Video Simulator',
                desc: 'Upload a recorded video. Frames are sent to the live backend in real time. Ghost gear, entanglement, and pile alerts fire automatically.',
                btn: 'Open ROV Simulator',
                action: () => onNavigate('rov'),
                accent: '#0d3260',
              },
              {
                icon: '💡',
                title: 'Cleanup Optimizer',
                desc: 'Compare surveyed areas with cost and crew-hour ranges. Helps cleanup teams allocate limited budgets to the highest-impact sites first.',
                btn: 'Open Optimizer',
                action: () => onNavigate('optimizer'),
                accent: '#0d4a2e',
              },
            ].map((f) => (
              <div key={f.title} className="home-card" style={{ padding: '24px 22px' }}>
                <span style={{ fontSize: 28, display: 'block', marginBottom: 12 }}>{f.icon}</span>
                <h3 className="home-card-title" style={{ fontSize: 17, marginBottom: 10 }}>{f.title}</h3>
                <p className="home-card-desc" style={{ marginBottom: 18 }}>{f.desc}</p>
                <button
                  onClick={f.action}
                  style={{
                    background: f.accent, border: 'none', color: '#fff', fontWeight: 700,
                    fontSize: 13, padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
                    transition: 'opacity 0.18s, transform 0.15s',
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseOut={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none' }}
                >
                  {f.btn} &rarr;
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* UPLOAD ZONE */}
      <section className="home-upload-section">
        <div className="home-upload-inner">
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
            <p className="home-dropzone-title">Drop your underwater photo here</p>
            <p className="home-dropzone-sub">or click to browse &mdash; JPG, PNG, WebP up to 25 MB</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={handleInputChange}
          />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="home-how-section">
        <div className="home-how-inner">
          <p className="home-how-label">PIPELINE</p>
          <h2 className="home-how-title">How Blue Sentinel works</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
            {[
              { num: '01', title: 'Upload', desc: 'Submit a still image or video from ROVs, dive cameras, or research vessels.' },
              { num: '02', title: 'Detect', desc: 'RT-DETRv4 runs inference. Bounding boxes are drawn with class name and confidence score.' },
              { num: '03', title: 'Alert & Rank', desc: 'Ghost gear, entanglement, and large piles fire alerts. Piles are ranked by weighted hazard score.' },
              { num: '04', title: 'Plan', desc: 'The Optimizer estimates crew hours and costs to help prioritize cleanup resources.' },
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

      {/* ALERT LOGIC */}
      <section style={{ background: '#e4eff5', padding: '48px 32px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <p className="home-how-label">ALERT LOGIC</p>
          <h2 className="home-how-title">What triggers a real-time alert</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
            {[
              { color: '#ef4444', bg: '#fef2f2', border: '#fecaca', type: 'GHOST GEAR', title: 'Abandoned Fishing Gear', desc: 'Nets, ropes, and tarps detected in isolation. Fires after persisting across multiple frames.' },
              { color: '#f97316', bg: '#fff7ed', border: '#fed7aa', type: 'ENTANGLEMENT', title: 'Animal Near Ghost Gear', desc: 'Fish, crabs, eels, or starfish co-located with nets or ropes. Approximated from bbox proximity.' },
              { color: '#eab308', bg: '#fefce8', border: '#fef08a', type: 'LARGE PILE', title: 'High Debris Density', desc: '5+ objects in a single frame. Single items (bottle, cloth) are logged but never alert.' },
            ].map((a) => (
              <div key={a.type} style={{ background: a.bg, border: `1px solid ${a.border}`, borderTop: `3px solid ${a.color}`, borderRadius: 14, padding: '20px' }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: a.color, display: 'block', marginBottom: 8 }}>ALERT: {a.type}</span>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f2030', marginBottom: 8 }}>{a.title}</h3>
                <p style={{ fontSize: 12, color: '#4a7a8a', lineHeight: 1.6 }}>{a.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="home-footer">
        <p className="home-footer-title">Blue Sentinel 2.0 &mdash; Marine Debris Detection &amp; Ecological Audit System</p>
        <p className="home-footer-sub">RT-DETRv4 &middot; D-FINE HGNetV2-L &middot; TrashCan Dataset &middot; J-EDI &middot; JAMSTEC DARWIN</p>
      </footer>
    </div>
  )
}
