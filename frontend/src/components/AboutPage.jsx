import React from 'react'
import logo from '../assets/logo.png'

export default function AboutPage({ onNavigate, onGoToUpload, user, onShowAuth, onLogout }) {
  return (
    <div className="home-page">
      {/* ── NAVBAR ── */}
      <nav className="home-nav">
        <div className="home-nav-inner" style={{ justifyContent: 'space-between' }}>
          <button className="home-logo" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => onNavigate('home')}>
            <img src={logo} alt="Blue Sentinal" className="home-logo-img" />
            <span className="home-logo-text">Blue Sentinal</span>
          </button>

          <div className="home-nav-links">
            <button className="home-nav-link home-nav-link-active" onClick={() => onNavigate('about')}>About</button>
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
      <section className="home-hero" style={{ padding: '56px 32px 64px' }}>
        <div className="home-hero-inner">
          <div className="home-badge">
            <span className="home-badge-dot" />
            RTDETRv4 &nbsp;·&nbsp; D-FINE HGNetV2-L &nbsp;·&nbsp; TrashCan Dataset
          </div>
          <h1 className="home-hero-title">
            About the project
            <br />
            <em className="home-hero-italic">Blue Sentinal</em>
          </h1>
          <p className="home-hero-desc">
            An AI-powered marine defense system engineered to autonomously detect, localize,
            and classify underwater debris and marine biodiversity using real-time deep learning.
          </p>
        </div>
      </section>

      {/* ── MODEL SECTION ── */}
      <section className="home-how-section">
        <div className="home-how-inner">
          <p className="home-how-label">THE MODEL</p>
          <h2 className="home-how-title">D-FINE (HGNetV2-L) Architecture</h2>

          <div className="home-cards-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            {[
              { num: '69.5%', title: 'Detection Accuracy', desc: 'Measured on the TrashCan v2 underwater benchmark across 22 object categories.' },
              { num: '22', title: 'Marine Classes', desc: 'From plastic bottles and fishing nets to ROVs, fish, crabs, and coral debris.' },
              { num: '7K+', title: 'Images Trained', desc: 'Trained on thousands of annotated underwater frames captured by ROVs and dive cameras.' },
            ].map((s) => (
              <div key={s.num} className="home-card" style={{ textAlign: 'center' }}>
                <span style={{ fontSize: 32, fontWeight: 700, color: '#2a9a70', display: 'block', marginBottom: 8 }}>{s.num}</span>
                <h3 className="home-card-title" style={{ fontSize: 16 }}>{s.title}</h3>
                <p className="home-card-desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TECH STACK ── */}
      <section className="home-upload-section" style={{ padding: '48px 32px' }}>
        <div className="home-upload-inner">
          <p className="home-how-label">TECHNOLOGY STACK</p>
          <h2 className="home-how-title">Built with cutting-edge tools</h2>
          <div className="home-cards-grid">
            {[
              {
                num: 'AI / ML',
                title: 'D-FINE · PyTorch · HGNetV2-L',
                desc: 'State-of-the-art object detection architecture fine-tuned on underwater imagery with FP16 acceleration for real-time inference.',
              },
              {
                num: 'BACKEND',
                title: 'FastAPI · PostgreSQL 18 · pgvector',
                desc: 'High-performance async Python API backed by PostgreSQL 18 with pgvector for feature-embedding-based visual similarity search.',
              },
              {
                num: 'FRONTEND',
                title: 'React 19 · Vite · Tailwind CSS',
                desc: 'Modern reactive UI with drag-and-drop image upload, interactive bounding-box canvas, and printable PDF audit reports.',
              },
              {
                num: 'DATASET',
                title: 'TrashCan v2 Underwater',
                desc: 'A curated dataset of 7,000+ annotated underwater frames covering 22 marine debris and biodiversity categories.',
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

      {/* ── CLASSES ── */}
      <section className="home-how-section">
        <div className="home-how-inner">
          <p className="home-how-label">SUPPORTED CLASSES</p>
          <h2 className="home-how-title">What Blue Sentinal can detect</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {[
              'rov', 'plant', 'animal_fish', 'animal_starfish', 'animal_shells', 'animal_crab',
              'animal_eel', 'animal_etc', 'trash_clothing', 'trash_pipe', 'trash_bottle',
              'trash_bag', 'trash_snack_wrapper', 'trash_can', 'trash_cup', 'trash_container',
              'trash_unknown', 'trash_branch', 'trash_wreckage', 'trash_tarp', 'trash_rope', 'trash_net',
            ].map((cls) => (
              <span key={cls} style={{
                background: '#fff',
                border: '1px solid #c0d8e4',
                borderRadius: 999,
                padding: '4px 14px',
                fontSize: 12,
                color: '#1a4a6a',
                fontFamily: 'Courier New, monospace',
              }}>{cls}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="home-hero" style={{ padding: '56px 32px', textAlign: 'center' }}>
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'Lora, Georgia, serif', fontSize: 36, color: '#fff', marginBottom: 16 }}>
            Ready to analyze?
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.8)', marginBottom: 32, fontSize: 15 }}>
            Sign up for free and upload your first underwater photo in seconds.
          </p>
          {user ? (
            <button className="about-cta-btn" onClick={onGoToUpload}>
              Go to Upload ↗
            </button>
          ) : (
            <button className="about-cta-btn" onClick={() => onShowAuth('signup')}>
              Get Started — It&apos;s Free
            </button>
          )}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="home-footer">
        <p className="home-footer-title">Blue Sentinal — Ocean debris detection for researchers</p>
        <p className="home-footer-sub">Model: RTDETRv4 model &nbsp;·&nbsp; Dataset: Trashcan Dataset</p>
      </footer>
    </div>
  )
}
