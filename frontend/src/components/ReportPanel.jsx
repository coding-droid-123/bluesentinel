import React, { useState } from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

const S = {
  // Overlay
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
    background: 'rgba(10,20,40,0.60)',
    backdropFilter: 'blur(4px)',
  },
  // Modal shell
  modal: {
    background: '#fff', borderRadius: 20,
    boxShadow: '0 24px 64px rgba(10,20,40,0.22)',
    width: '100%', maxWidth: 680,
    maxHeight: '90vh',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
  },
  // Top chrome bar
  chrome: {
    padding: '14px 20px',
    borderBottom: '1px solid #e2e8f0',
    background: '#f8fafc',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexShrink: 0,
  },
  chromeTitle: { fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 },
  chromeSub: { fontSize: 12, color: '#64748b', margin: '2px 0 0' },
  iconBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    padding: 6, borderRadius: 8, color: '#64748b',
    fontSize: 16, lineHeight: 1, transition: 'background 0.15s',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  // Scrollable body
  body: { flex: 1, overflowY: 'auto', padding: '24px 24px', background: '#f1f5f9' },

  // ── Printable document ──
  doc: {
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    padding: '36px 40px',
    maxWidth: 600,
    margin: '0 auto',
    color: '#0f172a',
    fontSize: 13,
    lineHeight: 1.6,
  },

  // Header
  docHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingBottom: 18, marginBottom: 22,
    borderBottom: '2.5px solid #1e40af',
  },
  brandRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 },
  brandName: { fontSize: 22, fontWeight: 800, color: '#1e3a8a', margin: 0, letterSpacing: '-0.5px' },
  brandSub: { fontSize: 10, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 },
  metaBlock: { textAlign: 'right', fontSize: 11, color: '#64748b', lineHeight: 1.7 },
  metaStrong: { color: '#334155', fontWeight: 600 },

  // Section
  section: { marginBottom: 22 },
  sectionTitle: {
    fontSize: 10, fontWeight: 800, color: '#1e3a8a',
    textTransform: 'uppercase', letterSpacing: '0.1em',
    marginBottom: 10, paddingBottom: 6,
    borderBottom: '1px solid #e2e8f0',
  },

  // Summary text
  summaryText: { fontSize: 13, color: '#334155', lineHeight: 1.7, margin: 0 },
  highlight: { fontWeight: 700, color: '#0f172a' },
  highlightGreen: { fontWeight: 700, color: '#065f46' },
  highlightSeverity: (sev) => ({
    fontWeight: 800, textTransform: 'uppercase', fontSize: 13,
    color: sev === 'critical' ? '#b91c1c' : sev === 'high' ? '#c2410c' : sev === 'medium' ? '#92400e' : '#065f46',
  }),

  // Table
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  thead: { background: '#f1f5f9' },
  th: { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#475569', borderBottom: '2px solid #e2e8f0' },
  td: { padding: '9px 12px', borderBottom: '1px solid #f1f5f9', color: '#334155', verticalAlign: 'middle' },
  tdNum: { padding: '9px 12px', borderBottom: '1px solid #f1f5f9', color: '#94a3b8', fontWeight: 600, verticalAlign: 'middle' },
  tdConf: (color) => ({ padding: '9px 12px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: color || '#2563eb', verticalAlign: 'middle' }),
  tdTier: (sev) => ({
    padding: '9px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 11, fontWeight: 700,
    color: sev === 'critical' || sev === 'high' ? '#b91c1c' : sev === 'medium' ? '#92400e' : '#065f46',
    verticalAlign: 'middle',
  }),

  // Bullet list
  ul: { margin: 0, paddingLeft: 20 },
  li: { marginBottom: 6, color: '#334155', fontSize: 13 },

  // Stats row
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 22 },
  statBox: {
    background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
    padding: '12px 14px', textAlign: 'center',
  },
  statVal: { fontSize: 20, fontWeight: 800, color: '#1e3a8a', margin: 0, lineHeight: 1.1 },
  statLbl: { fontSize: 10, color: '#64748b', marginTop: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' },

  // Footer
  docFooter: {
    paddingTop: 16, marginTop: 8,
    borderTop: '1px solid #e2e8f0',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontSize: 10, color: '#94a3b8',
  },
  footerBadge: {
    background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 99,
    padding: '2px 10px', fontSize: 10, fontWeight: 700, color: '#16a34a',
  },

  // Bottom action bar
  actions: {
    padding: '14px 20px',
    borderTop: '1px solid #e2e8f0',
    background: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexShrink: 0,
  },
  cancelBtn: {
    background: '#f1f5f9', border: 'none', color: '#475569',
    fontWeight: 600, fontSize: 13, padding: '9px 20px',
    borderRadius: 10, cursor: 'pointer', transition: 'background 0.15s',
  },
  downloadBtn: {
    background: 'linear-gradient(135deg, #1e8a5e, #25a870)',
    border: 'none', color: '#fff',
    fontWeight: 700, fontSize: 13, padding: '9px 24px',
    borderRadius: 10, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 8,
    transition: 'opacity 0.15s',
  },
}

const TIER = (conf) => conf >= 80 ? 'High Risk' : conf >= 55 ? 'Elevated' : 'Moderate'
const TIER_COL = (conf) => conf >= 80 ? '#b91c1c' : conf >= 55 ? '#c2410c' : '#92400e'

export default function ReportPanel({ results, annotatedSrc, isOpen, onClose }) {
  const [isExporting, setIsExporting] = useState(false)

  if (!isOpen) return null

  const handleDownloadPDF = async () => {
    const el = document.getElementById('printableReport')
    if (!el) return
    setIsExporting(true)
    try {
      const canvas = await html2canvas(el, { scale: 2.5, backgroundColor: '#ffffff', useCORS: true })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfW = pdf.internal.pageSize.getWidth()
      const pdfH = (canvas.height * pdfW) / canvas.width
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH)
      pdf.save(`BlueSentinel_Audit_${Date.now()}.pdf`)
    } catch (e) {
      console.error('PDF export failed:', e)
      alert('PDF generation failed. Try using the Print button instead.')
    } finally {
      setIsExporting(false)
    }
  }

  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const items = results?.items || []
  const sev = results?.severity || 'low'
  const SEV_COLOR = { critical: '#b91c1c', high: '#c2410c', medium: '#92400e', low: '#065f46' }

  return (
    <div style={S.overlay}>
      <div style={S.modal}>

        {/* ── Chrome bar ── */}
        <div style={S.chrome}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📋</div>
            <div>
              <p style={S.chromeTitle}>Environmental Impact Audit</p>
              <p style={S.chromeSub}>Official marine debris survey report</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={S.iconBtn} title="Print" onClick={() => window.print()}>🖨</button>
            <button style={S.iconBtn} title="Close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div style={S.body}>
          <div id="printableReport" style={S.doc}>

            {/* Document header */}
            <div style={S.docHeader}>
              <div>
                <div style={S.brandRow}>
                  <span style={{ fontSize: 26 }}>🌊</span>
                  <h1 style={S.brandName}>Blue Sentinal</h1>
                </div>
                <p style={S.brandSub}>Marine Ecological Survey &amp; Debris Audit</p>
              </div>
              <div style={S.metaBlock}>
                <div><span style={S.metaStrong}>Date:</span> {date}</div>
                <div><span style={S.metaStrong}>Model:</span> RT-DETRv4</div>
              </div>
            </div>

            {/* Stats summary row */}
            <div style={S.statsRow}>
              <div style={S.statBox}>
                <p style={S.statVal}>{results?.totalCount ?? 0}</p>
                <p style={S.statLbl}>Objects Detected</p>
              </div>
              <div style={S.statBox}>
                <p style={{ ...S.statVal, color: '#065f46' }}>{results?.avgConfidence ?? '0%'}</p>
                <p style={S.statLbl}>Avg Confidence</p>
              </div>
              <div style={S.statBox}>
                <p style={{ ...S.statVal, color: SEV_COLOR[sev] }}>{sev.toUpperCase()}</p>
                <p style={S.statLbl}>Threat Severity</p>
              </div>
            </div>

            {/* 1. Executive Summary */}
            <div style={S.section}>
              <p style={S.sectionTitle}>1. Executive Summary</p>
              <p style={S.summaryText}>
                Automated optical inspection conducted via high-resolution marine imagery.
                The neural network identified{' '}
                <span style={S.highlight}>{results?.totalCount ?? 0} target debris item{(results?.totalCount ?? 0) !== 1 ? 's' : ''}</span>{' '}
                with an average classification confidence of{' '}
                <span style={S.highlightGreen}>{results?.avgConfidence ?? '0%'}</span>.{' '}
                Ecological threat severity is categorized as{' '}
                <span style={S.highlightSeverity(sev)}>{sev}</span>.
              </p>
            </div>

            {/* 2. Classification Breakdown */}
            <div style={S.section}>
              <p style={S.sectionTitle}>2. Classification Breakdown</p>
              <table style={S.table}>
                <thead style={S.thead}>
                  <tr>
                    <th style={S.th}>Item #</th>
                    <th style={S.th}>Debris Classification</th>
                    <th style={S.th}>Model Confidence</th>
                    <th style={S.th}>Threat Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length > 0 ? items.map((item, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={S.tdNum}>#{i + 1}</td>
                      <td style={S.td}>{item.name}</td>
                      <td style={S.tdConf(item.color)}>{Math.round(item.confidence)}%</td>
                      <td style={{ ...S.td, color: TIER_COL(item.confidence), fontWeight: 700 }}>{TIER(item.confidence)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="4" style={{ ...S.td, textAlign: 'center', color: '#94a3b8', padding: '20px 12px' }}>
                        ✅ No debris detected in this scan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 3. Detection Visualization */}
            {annotatedSrc && (
              <div style={S.section}>
                <p style={S.sectionTitle}>3. Detection Visualization</p>
                <p style={{ fontSize: 12, color: '#64748b', marginBottom: 10, marginTop: 0 }}>
                  Annotated output from the D-FINE HGNetV2-L model with bounding boxes.
                </p>
                <div style={{
                  borderRadius: 8, overflow: 'hidden',
                  border: '1px solid #1e3a8a',
                  background: '#0f172a',
                  marginBottom: 10,
                }}>
                  <img
                    src={annotatedSrc}
                    alt="Annotated detection"
                    style={{ width: '100%', display: 'block', maxHeight: 320, objectFit: 'contain' }}
                  />
                </div>
                {/* legend */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {items.slice(0, 6).map((item, i) => (
                    <span key={i} style={{
                      background: '#f8fafc', border: '1px solid #e2e8f0',
                      borderRadius: 999, padding: '3px 10px',
                      fontSize: 11, color: '#334155',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, display: 'inline-block', flexShrink: 0 }} />
                      {item.name} — {Math.round(item.confidence)}%
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Recommended Ecological Mitigation */}
            <div style={S.section}>
              <p style={S.sectionTitle}>4. Recommended Ecological Mitigation</p>
              <ul style={S.ul}>
                <li style={S.li}>Immediate extraction of high-density plastic items to avoid breakdown.</li>
                <li style={S.li}>Surface ROV verification scan recommended within 14 days.</li>
                <li style={S.li}>Log coordinates with regional coastal conservation database.</li>
                {sev === 'critical' && <li style={{ ...S.li, fontWeight: 700, color: '#b91c1c' }}>⚠ Critical alert — escalate to regional environmental authority.</li>}
              </ul>
            </div>

            {/* Document footer */}
            <div style={S.docFooter}>
              <span>Blue Sentinal Marine Defense System</span>
              <span style={S.footerBadge}>✓ Verified</span>
              <span>Generated Automatically</span>
            </div>
          </div>
        </div>

        {/* ── Action bar ── */}
        <div style={S.actions}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Ready to export as high-fidelity PDF</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
            <button style={S.downloadBtn} onClick={handleDownloadPDF} disabled={isExporting}>
              {isExporting ? '⏳ Generating…' : '⬇ Download PDF'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
