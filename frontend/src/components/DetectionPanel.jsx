import React, { useState } from 'react'
import {
  ShieldAlert,
  Sparkles,
  Download,
  Eye,
  EyeOff,
  Sliders,
  Layers,
  Fish,
  Clock,
  AlertTriangle,
  FileText,
  CheckCircle2
} from 'lucide-react'

export default function DetectionPanel({
  results,
  imageSrc,
  originalImageSrc,
  isAnalyzing,
  onOpenReport
}) {
  const [showBoxes, setShowBoxes] = useState(true)
  const [minConfidence, setMinConfidence] = useState(30)
  const [selectedClass, setSelectedClass] = useState('all')

  // Filter items based on confidence slider and class filter
  const items = results?.items || []
  const filteredItems = items.filter(
    (item) => item.confidence >= minConfidence && (selectedClass === 'all' || item.name === selectedClass)
  )

  const uniqueClasses = Array.from(new Set(items.map((i) => i.name)))

  // Download the currently displayed annotated image
  const handleDownloadImage = () => {
    if (!imageSrc) return
    const link = document.createElement('a')
    link.href = imageSrc
    link.download = `BlueSentinel_Detection_${Date.now()}.jpg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // If no results yet, show intuitive empty state
  if (!results) {
    return (
      <div className="flex flex-col gap-6">
        {/* Placeholder Stat Badges */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          {[
            { label: 'Objects Detected', value: '—', sub: 'Ready for scan', color: 'text-slate-400' },
            { label: 'Avg Confidence', value: '—', sub: 'Model awaiting input', color: 'text-slate-400' },
            { label: 'Threat Severity', value: '—', sub: 'Standard assessment', color: 'text-slate-400' },
            { label: 'Primary Category', value: '—', sub: 'TrashCan dataset', color: 'text-slate-400' },
          ].map((card, idx) => (
            <div key={idx} className="stat-card-white flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {card.label}
              </span>
              <div className="my-2 text-2xl font-bold text-slate-400">{card.value}</div>
              <span className="text-[11px] text-slate-400">{card.sub}</span>
            </div>
          ))}
        </div>

        {/* Empty Canvas View */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-subtle p-12 flex flex-col items-center justify-center min-h-[440px] text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-accentBlue mb-4 shadow-sm">
            <Layers className="w-8 h-8 text-accentBlue" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-1.5">
            Awaiting Marine Inspection Image
          </h3>
          <p className="text-sm text-slate-500 max-w-md mb-6 leading-relaxed">
            Select or drag an underwater photo into the panel on the left, then click{' '}
            <strong className="text-emerald-700 font-semibold">"Run Detection"</strong> to identify debris and analyze ecological threats.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
            <span className="px-3 py-1 bg-slate-100 rounded-full border border-slate-200">
              ⚡ D-FINE HGNetV2-L
            </span>
            <span className="px-3 py-1 bg-slate-100 rounded-full border border-slate-200">
              🌊 22 Marine Debris Classes
            </span>
            <span className="px-3 py-1 bg-slate-100 rounded-full border border-slate-200">
              🎯 Real-time Bounding Boxes
            </span>
          </div>
        </div>
      </div>
    )
  }

  // Active Detection Results State
  const sev = results.severity || 'low'
  const severityBadgeColors = {
    low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    high: 'bg-orange-50 text-orange-700 border-orange-200',
    critical: 'bg-red-50 text-red-700 border-red-200',
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Key Metrics Row (60% White cards, 30% Ocean blue titles, 10% Emerald green indicators) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* Metric 1 */}
        <div className="stat-card-white flex flex-col justify-between border-l-4 border-l-accentBlue">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Total Detections
          </span>
          <div className="my-1.5 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-blue-900">{results.totalCount}</span>
            <span className="text-xs font-medium text-slate-500">items</span>
          </div>
          <span className="text-[11px] text-blue-600 font-medium">
            {results.debrisTypes} unique {results.debrisTypes === 1 ? 'type' : 'types'}
          </span>
        </div>

        {/* Metric 2 (10% Green Accent for High Confidence) */}
        <div className="stat-card-white flex flex-col justify-between border-l-4 border-l-accentGreen">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Avg Confidence
          </span>
          <div className="my-1.5 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-600">{results.avgConfidence}</span>
          </div>
          <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-accentGreen" /> Model Certainty
          </span>
        </div>

        {/* Metric 3 */}
        <div className="stat-card-white flex flex-col justify-between border-l-4 border-l-blue-400">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Ecological Threat
          </span>
          <div className="my-1.5">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${
                severityBadgeColors[sev] || severityBadgeColors.medium
              }`}
            >
              {sev}
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            {sev === 'low' ? 'Minimal Risk' : sev === 'medium' ? 'Moderate Risk' : 'Urgent Cleanup'}
          </span>
        </div>

        {/* Metric 4 */}
        <div className="stat-card-white flex flex-col justify-between border-l-4 border-l-indigo-500">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Primary Material
          </span>
          <div className="my-1.5 text-lg font-bold text-slate-800 truncate" title={items[0]?.name || 'N/A'}>
            {items[0]?.name || 'None detected'}
          </div>
          <span className="text-[11px] text-slate-500">Non-biodegradable</span>
        </div>
      </div>

      {/* 2. Visual Inspection Workspace */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-subtle overflow-hidden">
        {/* Toolbar */}
        <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-accentBlue" />
              Inspection Canvas
            </span>
            <span className="text-xs text-slate-500 font-medium bg-white px-2 py-0.5 rounded border border-slate-200">
              Showing {filteredItems.length} of {items.length}
            </span>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Confidence Slider Filter */}
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-xs">
              <Sliders className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-600 font-medium">Min Conf:</span>
              <input
                type="range"
                min="20"
                max="90"
                step="5"
                value={minConfidence}
                onChange={(e) => setMinConfidence(Number(e.target.value))}
                className="w-20 accent-blue-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
              />
              <span className="font-bold text-blue-700 w-7">{minConfidence}%</span>
            </div>

            {/* Quick Actions */}
            <button
              type="button"
              onClick={handleDownloadImage}
              className="px-3 py-1.5 bg-white text-slate-700 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Download full resolution annotated JPG"
            >
              <Download className="w-3.5 h-3.5 text-accentBlue" />
              Image
            </button>

            <button
              type="button"
              onClick={onOpenReport}
              className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Generate PDF environmental impact document"
            >
              <FileText className="w-3.5 h-3.5 text-accentBlue" />
              Report
            </button>
          </div>
        </div>

        {/* Image Canvas */}
        <div className="relative p-4 bg-slate-900/5 min-h-[380px] max-h-[540px] flex items-center justify-center overflow-auto">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt="Analyzed underwater debris"
              className="max-h-[500px] w-auto max-w-full object-contain rounded-xl shadow-card"
            />
          ) : (
            <div className="text-center py-12 text-slate-400 text-sm">
              Image could not be rendered
            </div>
          )}
        </div>
      </div>

      {/* 3. Split Bottom Section: Itemized Inventory & Ecological Impact */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Itemized Debris Inventory (2 Cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-subtle p-5">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div>
              <h4 className="text-sm font-bold text-slate-800">Detected Marine Debris Inventory</h4>
              <p className="text-xs text-slate-500">
                Individual targets classified by the D-FINE network
              </p>
            </div>
            {uniqueClasses.length > 1 && (
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">All Classes ({items.length})</option>
                {uniqueClasses.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
            )}
          </div>

          {filteredItems.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              No items meet the current confidence filter ({minConfidence}%).
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[280px] overflow-y-auto pr-1">
              {filteredItems.map((item, idx) => (
                <div
                  key={idx}
                  className="py-2.5 flex items-center justify-between hover:bg-slate-50/80 px-2 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: item.color || '#2563eb' }}
                    />
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{item.name}</div>
                      <div className="text-[11px] text-slate-400">Class Target #{idx + 1}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 bg-slate-100 rounded-full h-2 hidden sm:block overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-600"
                        style={{ width: `${item.confidence}%` }}
                      />
                    </div>
                    <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                      {Math.round(item.confidence)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Integrated Ecological Impact Gauge (1 Col) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-subtle p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Fish className="w-4 h-4 text-accentBlue" />
                Ecological Impact
              </h4>
              <span className="text-[10px] text-slate-400 font-semibold uppercase">Risk Score</span>
            </div>

            {/* Severity Gauge */}
            <div className="mb-4">
              <div className="flex justify-between items-center text-xs font-bold mb-1.5">
                <span className="text-slate-600">Severity Status:</span>
                <span className="uppercase text-blue-700">{sev}</span>
              </div>
              <div className="severity-bar-bg">
                <div className={`severity-fill ${sev}`} style={{ width: sev === 'low' ? '25%' : sev === 'medium' ? '50%' : sev === 'high' ? '75%' : '100%' }} />
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-medium">
                <span>Low</span>
                <span>Medium</span>
                <span>High</span>
                <span>Critical</span>
              </div>
            </div>

            {/* Threat factors */}
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-slate-700">Entanglement Hazard</div>
                  <div className="text-[11px] text-slate-500">
                    High risk for marine mammals and coral structures.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <Clock className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-slate-700">Degradation Rate</div>
                  <div className="text-[11px] text-slate-500">
                    Estimated 450+ years for plastic breakdown into microparticles.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onOpenReport}
              className="w-full py-2 px-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-accentGreen" />
              Generate Official Action Report
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
