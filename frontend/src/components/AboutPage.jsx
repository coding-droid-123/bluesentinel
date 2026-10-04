import React from 'react'
import logo from '../assets/logo.png'

export default function AboutPage({ onNavigate }) {
  return (
    <div className="home-page">
      <nav className="home-nav">
        <div className="home-nav-inner" style={{ justifyContent: 'space-between' }}>
          <button className="home-logo" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => onNavigate('home')}>
            <img src={logo} alt="Blue Sentinel" className="home-logo-img" />
            <span className="home-logo-text">Blue Sentinel</span>
          </button>
          <div className="home-nav-links">
            <button className="home-nav-link" onClick={() => onNavigate('home')}>Home</button>
            <button className="home-nav-link" onClick={() => onNavigate('rov')}>ROV Simulator</button>
            <button className="home-nav-link" onClick={() => onNavigate('optimizer')}>Optimizer</button>
            <button className="home-nav-link home-nav-link-active">About</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="home-hero" style={{ padding: '56px 32px 64px' }}>
        <div className="home-hero-inner">
          <div className="home-badge">
            <span className="home-badge-dot" />
            RT-DETRv4 &nbsp;&middot;&nbsp; D-FINE HGNetV2-L &nbsp;&middot;&nbsp; TrashCan Dataset
          </div>
          <h1 className="home-hero-title">
            About the project<br />
            <em className="home-hero-italic">Blue Sentinel 2.0</em>
          </h1>
          <p className="home-hero-desc">
            An AI-powered marine defense system engineered to detect, localize, and classify underwater debris
            and marine biodiversity &mdash; with real-time ROV video alerts, pile ranking, and a Cleanup Cost Optimizer.
          </p>
        </div>
      </section>

      {/* Scale-up plan summary */}
      <section className="home-how-section">
        <div className="home-how-inner">
          <p className="home-how-label">SCALE-UP PLAN &middot; 3 OCTOBER 2026</p>
          <h2 className="home-how-title">What Blue Sentinel 2.0 adds</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            {[
              { num: 'Alerts', title: 'Real-time decision layer', desc: 'Ghost gear, entangled animals, and large piles fire alerts from live video. A single bottle or cloth item is logged but never alerts.' },
              { num: 'Ranking', title: 'Pile priority ranking', desc: 'Objects are counted per frame and ranked by weighted hazard score. Cleanup effort goes to the most dangerous pile first.' },
              { num: 'Planning', title: 'Cleanup Cost Optimizer', desc: 'Compares surveyed areas with cost and crew-hour ranges under stated assumptions. Validated against real data before operational use.' },
            ].map((s) => (
              <div key={s.num} className="home-card" style={{ textAlign: 'center' }}>
                <span style={{ fontSize: 28, fontWeight: 700, color: '#2a9a70', display: 'block', marginBottom: 8 }}>{s.num}</span>
                <h3 className="home-card-title" style={{ fontSize: 16 }}>{s.title}</h3>
                <p className="home-card-desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Model */}
      <section className="home-upload-section" style={{ padding: '48px 32px' }}>
        <div className="home-upload-inner">
          <p className="home-how-label">THE MODEL</p>
          <h2 className="home-how-title">D-FINE (HGNetV2-L) Architecture</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
            {[
              { num: '69.5%', title: 'Detection mAP', desc: 'Measured on the TrashCan v2 underwater benchmark across 22 object categories.' },
              { num: '22', title: 'Marine Classes', desc: 'From plastic bottles and fishing nets to ROVs, fish, crabs, and coral debris.' },
              { num: '7K+', title: 'Images Trained', desc: 'Annotated underwater frames from ROVs and dive cameras.' },
              { num: 'ONNX', title: 'Export Formats', desc: 'Converted to ONNX, TorchScript, TensorRT-ready for edge deployment.' },
            ].map((s) => (
              <div key={s.num} className="home-card" style={{ textAlign: 'center' }}>
                <span style={{ fontSize: 28, fontWeight: 700, color: '#2a9a70', display: 'block', marginBottom: 8 }}>{s.num}</span>
                <h3 className="home-card-title" style={{ fontSize: 16 }}>{s.title}</h3>
                <p className="home-card-desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech stack */}
      <section className="home-how-section">
        <div className="home-how-inner">
          <p className="home-how-label">TECHNOLOGY STACK</p>
          <h2 className="home-how-title">Built with cutting-edge tools</h2>
          <div className="home-cards-grid">
            {[
              { num: 'AI / ML', title: 'D-FINE / RT-DETRv4 / HGNetV2-L', desc: 'State-of-the-art object detection fine-tuned on underwater imagery. Exported to ONNX, TorchScript, and TensorRT for edge deployment.' },
              { num: 'BACKEND', title: 'FastAPI / PostgreSQL 18 / pgvector', desc: 'Async Python API. PostgreSQL 18 with pgvector for feature-embedding visual similarity search.' },
              { num: 'FRONTEND', title: 'React 19 / Vite / Tailwind CSS', desc: 'ROV video frame extraction via Canvas API, live backend calls, alert log, pile ranking, PDF audit reports.' },
              { num: 'DATASET', title: 'TrashCan v2 / J-EDI / DARWIN', desc: '7,000+ annotated underwater frames. J-EDI and JAMSTEC DARWIN as potential ROV position data sources.' },
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

      {/* Stated limitations (from plan doc, section 5) */}
      <section className="home-upload-section" style={{ padding: '48px 32px' }}>
        <div className="home-upload-inner">
          <p className="home-how-label">STATED LIMITATIONS</p>
          <h2 className="home-how-title">What the system openly cannot do</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              'Without a scale reference, pile size is a count and relative area only. Positions are approximate.',
              'Entanglement detection from bounding-box overlap is an approximation and can produce false alerts.',
              'Cost figures in the Optimizer are assumptions until validated against real operational data.',
              'TensorRT deployment is TensorRT-ready only — no Jetson hardware is currently available for testing.',
              'ROV position continuity from J-EDI/DARWIN has not been confirmed — check dive pages or contact JAMSTEC.',
            ].map((lim, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 16px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
                <p style={{ fontSize: 13, color: '#78350f', lineHeight: 1.55 }}>{lim}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Classes */}
      <section className="home-how-section">
        <div className="home-how-inner">
          <p className="home-how-label">SUPPORTED CLASSES</p>
          <h2 className="home-how-title">What Blue Sentinel can detect</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {['rov','plant','animal_fish','animal_starfish','animal_shells','animal_crab','animal_eel','animal_etc',
              'trash_clothing','trash_pipe','trash_bottle','trash_bag','trash_snack_wrapper','trash_can','trash_cup',
              'trash_container','trash_unknown','trash_branch','trash_wreckage','trash_tarp','trash_rope','trash_net'
            ].map((cls) => (
              <span key={cls} style={{ background: '#fff', border: '1px solid #c0d8e4', borderRadius: 999, padding: '4px 14px', fontSize: 12, color: '#1a4a6a', fontFamily: 'Courier New, monospace' }}>
                {cls}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="home-hero" style={{ padding: '56px 32px', textAlign: 'center' }}>
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'Lora, Georgia, serif', fontSize: 34, color: '#fff', marginBottom: 16 }}>Ready to explore?</h2>
          <p style={{ color: 'rgba(255,255,255,0.8)', marginBottom: 32, fontSize: 15 }}>
            Upload an image, stream live video through the ROV Simulator, or run the Cleanup Optimizer.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="about-cta-btn" onClick={() => onNavigate('home')}>Analyze Image &rarr;</button>
            <button className="about-cta-btn" onClick={() => onNavigate('rov')} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>
              ROV Simulator &rarr;
            </button>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        <p className="home-footer-title">Blue Sentinel 2.0 &mdash; Marine Debris Detection &amp; Ecological Audit System</p>
        <p className="home-footer-sub">RT-DETRv4 &middot; TrashCan Dataset &middot; J-EDI &middot; JAMSTEC DARWIN &middot; Scale-Up Plan: 3 Oct 2026</p>
      </footer>
    </div>
  )
}
