import React, { useRef } from 'react'
import logo from '../assets/logo.png'

const SEVERITY_COLOR = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#10b981',
}
const SEVERITY_BG = {
  critical: '#fef2f2',
  high: '#fff7ed',
  medium: '#fefce8',
  low: '#f0fdf4',
}

export default function UploadPage({
  imageSrc,
  annotatedSrc,
  fileMeta,
  isAnalyzing,
  results,
  errorMessage,
  onAnalyze,
  onClear,
  onFileSelect,
  onFileReplace,
  onOpenReport,
  onDismissError,
  user,
  onNavigate,
  onLogout,
}) {
  const replaceRef = useRef(null)
  const firstPickRef = useRef(null)

  // ── Empty state: no image selected yet ──
  if (!imageSrc) {
    return (
      <div className="home-page">
        <nav className="home-nav">
          <div className="home-nav-inner" style={{ justifyContent: 'space-between' }}>
            <button className="home-logo" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={onClear}>
              <img src={logo} alt="Blue Sentinal" className="home-logo-img" />
              <span className="home-logo-text">Blue Sentinal</span>
            </button>
            <div className="home-nav-links">
              <button className="home-nav-link" onClick={() => onNavigate('about')}>About</button>
              {user && <span className="home-nav-user">👋 {user.name}</span>}
              <button className="home-nav-link" onClick={onClear}>← Home</button>
              {user && <button className="home-nav-link" onClick={onLogout}>Log Out</button>}
            </div>
          </div>
        </nav>

        <section className="upload-hero">
          <div className="home-hero-inner">
            <div className="home-badge"><span className="home-badge-dot" />RTDETRv4 &nbsp;·&nbsp; 22 Marine Classes</div>
            <h1 className="home-hero-title" style={{ fontSize: 'clamp(28px,4vw,42px)', marginBottom: 8 }}>
              Upload your<br /><em className="home-hero-italic">Underwater Image</em>
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14 }}>
              Drop or select a photo to begin marine debris detection.
            </p>
          </div>
        </section>

        <section className="home-upload-section" style={{ padding: '48px 32px 64px' }}>
          <div className="home-upload-inner">
            <div
              className="home-dropzone"
              style={{ maxWidth: 560, margin: '0 auto' }}
              onClick={() => firstPickRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const file = e.dataTransfer.files?.[0]
                if (file && file.type.startsWith('image/')) onFileSelect(file)
              }}
            >
              <div className="home-dropzone-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <p className="home-dropzone-title">Drop your underwater photo here</p>
              <p className="home-dropzone-sub">or click to browse — JPG, PNG, WebP up to 25 MB</p>
            </div>
            <input
              ref={firstPickRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelect(f) }}
            />
          </div>
        </section>

        <footer className="home-footer">
          <p className="home-footer-title">Blue Sentinal — Ocean debris detection for researchers</p>
          <p className="home-footer-sub">Model: RTDETRv4 &nbsp;·&nbsp; Dataset: Trashcan Dataset</p>
        </footer>
      </div>
    )
  }

  return (
    <div className="home-page">
      {/* ── NAVBAR ── */}
      <nav className="home-nav">
        <div className="home-nav-inner" style={{ justifyContent: 'space-between' }}>
          <button
            className="home-logo"
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={onClear}
          >
            <img src={logo} alt="Blue Sentinal" className="home-logo-img" />
            <span className="home-logo-text">Blue Sentinal</span>
          </button>

          <div className="home-nav-links">
            <button className="home-nav-link" onClick={() => onNavigate('about')}>About</button>
            {user && <span className="home-nav-user">👋 {user.name}</span>}
            <button className="home-nav-link" onClick={onClear}>← Home</button>
            {user && <button className="home-nav-link" onClick={onLogout}>Log Out</button>}
          </div>
        </div>
      </nav>

      {/* ── HERO STRIP ── */}
      <section className="upload-hero">
        <div className="home-hero-inner">
          <div className="home-badge">
            <span className="home-badge-dot" />
            D-FINE HGNetV2-L &nbsp;·&nbsp; RTDETRv4 &nbsp;·&nbsp; 22 Marine Classes
          </div>
          <h1 className="home-hero-title" style={{ fontSize: 'clamp(28px,4vw,42px)', marginBottom: 8 }}>
            Marine Debris
            <br />
            <em className="home-hero-italic">Analysis</em>
          </h1>
          {fileMeta && (
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 4 }}>
              📁 {fileMeta.name} &nbsp;·&nbsp; {fileMeta.size}
            </p>
          )}
        </div>
      </section>

      {/* ── ERROR BANNER ── */}
      {errorMessage && (
        <div className="upload-error-banner">
          <span>⚠️ {errorMessage}</span>
          <button onClick={onDismissError}>✕</button>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <section className="home-upload-section" style={{ padding: '36px 32px 48px' }}>
        <div className="home-upload-inner" style={{ maxWidth: 1100 }}>

          {/* ── STAT CARDS ── */}
          <div className="upload-stats-row">
            {[
              {
                label: 'OBJECTS DETECTED',
                value: results ? results.totalCount : '—',
                sub: results ? `${results.debrisTypes} unique type${results.debrisTypes !== 1 ? 's' : ''}` : 'Ready for scan',
              },
              {
                label: 'AVG CONFIDENCE',
                value: results ? results.avgConfidence : '—',
                sub: results ? 'Model confidence' : 'Model awaiting input',
              },
              {
                label: 'THREAT SEVERITY',
                value: results ? results.severity.toUpperCase() : '—',
                sub: results ? 'Ecological risk level' : 'Standard assessment',
                color: results ? SEVERITY_COLOR[results.severity] : undefined,
              },
              {
                label: 'PRIMARY CATEGORY',
                value: results ? (results.items[0]?.name || 'N/A') : '—',
                sub: 'TrashCan dataset',
              },
            ].map((s) => (
              <div key={s.label} className="home-card upload-stat-card">
                <p className="home-card-num">{s.label}</p>
                <p className="upload-stat-val" style={s.color ? { color: s.color } : {}}>
                  {s.value}
                </p>
                <p className="home-card-desc" style={{ marginTop: 4, fontSize: 12 }}>{s.sub}</p>
              </div>
            ))}
          </div>

          {/* ── IMAGE + RESULTS ── */}
          <div className="upload-main-grid">

            {/* Left — image preview (always original, no bbox) */}
            <div className="home-card upload-image-card">
              <p className="home-card-num" style={{ marginBottom: 14 }}>SELECTED IMAGE</p>
              <div className="upload-image-wrap">
                <img src={imageSrc} alt="Selected" className="upload-preview-img" />
              </div>

              <div className="upload-action-row">
                <button
                  className="upload-btn-replace"
                  onClick={() => replaceRef.current?.click()}
                  disabled={isAnalyzing}
                >
                  ↺ Replace
                </button>
                <input
                  ref={replaceRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileReplace(f) }}
                />
                <button
                  className="upload-btn-run"
                  onClick={onAnalyze}
                  disabled={isAnalyzing}
                >
                  {isAnalyzing ? (
                    <><span className="upload-spinner" /> Analyzing…</>
                  ) : (
                    <>▶ Run Detection</>
                  )}
                </button>
              </div>
            </div>

            {/* Right — results */}
            <div className="upload-results-col">
              {!results && !isAnalyzing && (
                <div className="home-card upload-awaiting">
                  <div className="upload-awaiting-icon">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 20h.01M7 20v-4" /><path d="M12 20V10" /><path d="M17 20V4" />
                    </svg>
                  </div>
                  <h3 className="home-card-title" style={{ fontSize: 20 }}>Awaiting Marine Inspection</h3>
                  <p className="home-card-desc" style={{ maxWidth: 320, margin: '10px auto 0' }}>
                    Click <strong style={{ color: '#1e8a5e' }}>"Run Detection"</strong> on the left to identify
                    debris and analyze ecological threats in your image.
                  </p>
                  <div className="upload-feature-pills">
                    <span className="upload-pill">⚡ D-FINE HGNetV2-L</span>
                    <span className="upload-pill">🌊 22 Marine Debris Classes</span>
                    <span className="upload-pill">🎯 Real-time Bounding Boxes</span>
                  </div>
                </div>
              )}

              {isAnalyzing && (
                <div className="home-card upload-awaiting">
                  <div className="upload-spinner-large" />
                  <h3 className="home-card-title" style={{ fontSize: 20, marginTop: 20 }}>Running Inference…</h3>
                  <p className="home-card-desc" style={{ marginTop: 8 }}>
                    D-FINE model is scanning your image for debris objects.
                  </p>
                </div>
              )}

              {results && (
                <>
                  {/* 1 ── Annotated image with bounding boxes (now FIRST) */}
                  {annotatedSrc && (
                    <div className="home-card">
                      <p className="home-card-num" style={{ marginBottom: 14 }}>DETECTION VISUALIZATION</p>
                      <p className="home-card-desc" style={{ marginBottom: 12, fontSize: 12 }}>
                        Bounding boxes drawn by the model around detected objects.
                      </p>
                      <div className="upload-bbox-wrap">
                        <img
                          src={annotatedSrc}
                          alt="Annotated detection result"
                          className="upload-bbox-img"
                        />
                      </div>
                      {/* Legend */}
                      <div className="upload-feature-pills" style={{ marginTop: 12, justifyContent: 'flex-start' }}>
                        {results.items.slice(0, 4).map((item, i) => (
                          <span key={i} className="upload-pill" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, display: 'inline-block', flexShrink: 0 }} />
                            {item.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 2 ── Detection items (now SECOND) */}
                  <div className="home-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <p className="home-card-num" style={{ margin: 0 }}>DETECTED OBJECTS</p>
                      <span style={{
                        background: SEVERITY_BG[results.severity],
                        color: SEVERITY_COLOR[results.severity],
                        border: `1px solid ${SEVERITY_COLOR[results.severity]}40`,
                        borderRadius: 999,
                        padding: '3px 12px',
                        fontSize: 11,
                        fontWeight: 700,
                      }}>
                        {results.severity.toUpperCase()} RISK
                      </span>
                    </div>

                    {results.items.length === 0 ? (
                      <p className="home-card-desc" style={{ textAlign: 'center', padding: '20px 0' }}>
                        ✅ No debris detected in this image.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {results.items.map((item, i) => (
                          <div key={i} className="upload-detection-item">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span className="upload-detection-dot" style={{ background: item.color }} />
                              <span className="upload-detection-name">{item.name}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                              <div className="upload-conf-bar-bg">
                                <div
                                  className="upload-conf-bar-fill"
                                  style={{ width: `${item.confidence}%`, background: item.color }}
                                />
                              </div>
                              <span className="upload-conf-text">{item.confidence}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 3 ── Scan record + Report */}
                  <div className="home-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <p className="home-card-num" style={{ margin: 0 }}>SCAN RECORD</p>
                      <p style={{ fontSize: 12, color: '#1a4a6a', fontFamily: 'Courier New, monospace', marginTop: 4 }}>
                        {results.batchId}
                      </p>
                    </div>
                    <button className="upload-report-btn" onClick={onOpenReport}>
                      📄 Download Report
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

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
