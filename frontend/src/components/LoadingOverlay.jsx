import React from 'react'
import { Loader2 } from 'lucide-react'

export default function LoadingOverlay({ active }) {
  if (!active) return null

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xl flex flex-col items-center gap-3.5 max-w-xs text-center">
        <div className="relative flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border-3 border-blue-100 border-t-accentBlue border-r-accentGreen animate-spin" />
          <span className="absolute text-lg">🌊</span>
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-800">Analyzing Marine Imagery</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            D-FINE (HGNetV2-L) scanning for underwater debris...
          </p>
        </div>
      </div>
    </div>
  )
}
