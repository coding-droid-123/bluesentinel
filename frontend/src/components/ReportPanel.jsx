import React, { useState } from 'react'
import { Download, X, Printer, CheckCircle2, ShieldAlert, FileText, Loader2 } from 'lucide-react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

export default function ReportPanel({ results, imageSrc, isOpen, onClose }) {
  const [isExporting, setIsExporting] = useState(false)

  if (!isOpen) return null

  const handleDownloadPDF = async () => {
    const el = document.getElementById('printableReport')
    if (!el) return
    setIsExporting(true)

    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
      pdf.save(`BlueSentinel_Marine_Audit_${Date.now()}.pdf`)
    } catch (e) {
      console.error('PDF export failed:', e)
      alert('PDF generation encountered an issue. Try printing via browser dialog.')
    } finally {
      setIsExporting(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-accentBlue flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Environmental Impact Audit</h3>
              <p className="text-xs text-slate-500">Official marine debris survey report</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
              title="Print"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body / Printable Document */}
        <div className="p-8 overflow-y-auto flex-1 bg-slate-50/50">
          <div
            id="printableReport"
            className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm text-slate-800 max-w-2xl mx-auto"
          >
            {/* Document Header */}
            <div className="flex items-start justify-between pb-6 border-b-2 border-blue-600 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">🌊</span>
                  <h1 className="text-xl font-black text-blue-900 tracking-tight">Blue Sentinel</h1>
                </div>
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
                  Marine Ecological Survey & Debris Audit
                </p>
              </div>
              <div className="text-right text-xs text-slate-500">
                <div className="font-semibold text-slate-700">Date: {currentDate}</div>
                <div>Model: D-FINE HGNetV2-L (FP16)</div>
                <div>Batch ID: {results?.batchId || 'LOCAL-EVAL'}</div>
              </div>
            </div>

            {/* Section 1: Executive Summary */}
            <div className="mb-6">
              <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                1. Executive Summary
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Automated optical inspection conducted via high-resolution marine imagery. The
                neural network identified{' '}
                <strong className="text-slate-900">{results?.totalCount || 0} target debris items</strong>{' '}
                with an average classification confidence of{' '}
                <strong className="text-emerald-700 font-bold">{results?.avgConfidence || '0%'}</strong>.
                Ecological threat severity is categorized as{' '}
                <strong className="text-blue-800 uppercase font-bold">{results?.severity || 'LOW'}</strong>.
              </p>
            </div>

            {/* Section 2: Detected Debris Inventory */}
            <div className="mb-6">
              <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider mb-2">
                2. Classification Breakdown
              </h4>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 text-left">
                    <tr>
                      <th className="py-2 px-3">Item #</th>
                      <th className="py-2 px-3">Debris Classification</th>
                      <th className="py-2 px-3">Model Confidence</th>
                      <th className="py-2 px-3">Threat Tier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {results?.items?.length ? (
                      results.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-2 px-3 text-slate-500">#{idx + 1}</td>
                          <td className="py-2 px-3 font-medium text-slate-800">{item.name}</td>
                          <td className="py-2 px-3 font-semibold text-blue-700">
                            {Math.round(item.confidence)}%
                          </td>
                          <td className="py-2 px-3 text-slate-600">Elevated</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4" className="py-3 px-3 text-center text-slate-400">
                          No debris detected in this scan.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 3: Remediation Guidelines */}
            <div className="mb-4">
              <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider mb-2">
                3. Recommended Ecological Mitigation
              </h4>
              <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
                <li>Immediate extraction of high-density plastic items to avoid breakdown.</li>
                <li>Surface ROV verification scan recommended within 14 days.</li>
                <li>Log coordinates with regional coastal conservation database.</li>
              </ul>
            </div>

            {/* Document Footer */}
            <div className="pt-4 border-t border-slate-200 text-[10px] text-slate-400 flex justify-between">
              <span>Blue Sentinel Marine Defense System</span>
              <span>Generated Automatically</span>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Audit document ready for export as high-fidelity PDF
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={isExporting}
              className="btn-primary-green px-5 py-2 text-xs flex items-center gap-2 cursor-pointer"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Generating PDF...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" /> Download Official PDF
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
