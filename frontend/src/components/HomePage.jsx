import React, { useRef, useCallback } from 'react'
import NavBar from './NavBar'

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
      <NavBar page="home" onNavigate={onNavigate} />

      {/* HERO */}
      <section className="home-hero">
        <div className="home-hero-inner">
          <div className="home-badge">
            <span className="home-badge-dot" />
            Lightweight-RTDETRv4 &nbsp;&middot;&nbsp; 68.6% mAP
          </div>
          <h1 className="home-hero-title">
            Autonomous Underwater Debris Defense<br />
            <em className="home-hero-italic">and Ecological Decision Support</em>
          </h1>
          <p className="home-hero-desc">
            Stream live ROV footage with real-time ONNX/TensorRT Runtime acceleration, Multi-Object Tracking (MOT)
            eliminating duplicate debris counting, possible wildlife entanglement alerts, and cleanup cost
            estimation.
          </p>

          <div style={{ display: 'flex', gap: 12, marginTop: 22, flexWrap: 'wrap' }}>
            <button
              onClick={() => onNavigate('rov')}
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none', color: '#fff', fontWeight: 700,
                fontSize: 14, padding: '12px 24px', borderRadius: 10, cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(16,185,129,0.35)',
              }}
            >
              🎥 Launch ROV Simulator &rarr;
            </button>

            <button
              onClick={() => onNavigate('optimizer')}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.3)',
                color: '#fff', fontWeight: 600,
                fontSize: 14, padding: '12px 22px', borderRadius: 10, cursor: 'pointer',
              }}
            >
              📊 Cleanup Estimator &rarr;
            </button>
          </div>

          <div className="home-stats" style={{ marginTop: 28 }}>
            <div className="home-stat">
              <span className="home-stat-value">6K+</span>
              <span className="home-stat-label">Training images</span>
            </div>
            <div className="home-stat">
              <span className="home-stat-value">22</span>
              <span className="home-stat-label">Debris categories</span>
            </div>
            <div className="home-stat">
              <span className="home-stat-value">68.6%</span>
              <span className="home-stat-label">Detection mAP</span>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURE CARDS */}
      <section style={{ background: '#ddeaf2', padding: '40px 32px 0' }}>
        <div style={{ maxWidth: 1100, margin: '0 270px' }}>
          <p className="home-how-label">CAPABILITIES</p>
          <h2 className="home-how-title" style={{ marginBottom: 20 }}>Blue Sentinel Core Workflows</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
            {[
              {
                icon: '🎥',
                title: 'ROV Edge Video Simulator',
                desc: 'Stream footage directly into ONNX/TensorRT Runtime inference. Features Multi-Object Tracking that eliminates duplicate counting across consecutive frames.',
                btn: 'Open ROV Simulator',
                action: () => onNavigate('rov'),
                accent: '#0d3260',
              },
              {
                icon: '💡',
                title: 'Cleanup Estimator',
                desc: 'Compare surveyed areas with cost and crew-hour ranges. Generates and dispatches logistics plans to the mission database to guide cleanup vessel operations.',
                btn: 'Open Cleanup Estimator',
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


      {/* HOW IT WORKS */}
      <section className="home-how-section">
        <div className="home-how-inner">
          <p className="home-how-label">PIPELINE</p>
          <h2 className="home-how-title">How Blue Sentinel works</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
            {[
              { num: '01', title: 'Upload', desc: 'Submit a footage from ROVs, dive cameras, or research vessels.' },
              { num: '02', title: 'Detect', desc: 'RT-DETRv4 runs inference. Bounding boxes are drawn with class name and confidence score.' },
              { num: '03', title: 'Alert & Rank', desc: 'Ghost gear,possible entanglement, and large piles fire alerts. Piles are ranked by weighted hazard score.' },
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
              { color: '#eab308', bg: '#fefce8', border: '#fef08a', type: 'LARGE PILE', title: 'High Debris Density', desc: 'objects per location. Single items (bottle, cloth) are logged but never alert.' },
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
        <p className="home-footer-title">Blue Sentinel &mdash; Marine Debris Detection &amp; Ecological Audit System</p>
        <p className="home-footer-sub">RT-DETRv4 &middot; HGNetV2-L &middot; TrashCan Dataset &middot; J-EDI &middot; JAMSTEC DARWIN</p>
      </footer>
    </div>
  )
}
