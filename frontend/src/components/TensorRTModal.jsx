import React, { useState, useEffect } from 'react'
import { API_BASE_URL } from '../config'

export default function TensorRTModal({ isOpen, onClose, onSelectEngine }) {
  const [deviceInfo, setDeviceInfo] = useState(null)
  const [isLoadingDevice, setIsLoadingDevice] = useState(false)
  const [selectedOnnx, setSelectedOnnx] = useState('bs-s.onnx')
  const [useFp16, setUseFp16] = useState(true)
  const [workspaceGb, setWorkspaceGb] = useState(4)
  const [isConverting, setIsConverting] = useState(false)
  const [conversionResult, setConversionResult] = useState(null)
  const [logs, setLogs] = useState([])
  const [copiedCmd, setCopiedCmd] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)

  // Fetch device capabilities on open
  useEffect(() => {
    if (!isOpen) return
    setIsLoadingDevice(true)
    setConversionResult(null)
    setLogs([])

    fetch(`${API_BASE_URL}/model/tensorrt/device-info`)
      .then((res) => res.json())
      .then((data) => {
        setDeviceInfo(data)
        if (data.available_onnx && data.available_onnx.length > 0) {
          setSelectedOnnx(data.available_onnx[0].name)
        }
      })
      .catch((err) => {
        setLogs((prev) => [...prev, `[ERROR] Failed to query device info: ${err.message}`])
      })
      .finally(() => {
        setIsLoadingDevice(false)
      })
  }, [isOpen])

  // Conversion timer
  useEffect(() => {
    let timer = null
    if (isConverting) {
      setElapsedSec(0)
      timer = setInterval(() => {
        setElapsedSec((s) => s + 1)
      }, 1000)
    }
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [isConverting])

  if (!isOpen) return null

  const handleStartConversion = async () => {
    setIsConverting(true)
    setConversionResult(null)
    setLogs([
      `[INIT] Initiating TensorRT engine compilation for target: ${selectedOnnx}...`,
      `[CONFIG] Precision: ${useFp16 ? 'FP16 (Half Precision)' : 'FP32'}, Workspace: ${workspaceGb} GB`,
      `[PROFILES] Dynamic Input Shape: min=1x3x640x640, opt=1x3x640x640, max=1x3x640x640`,
    ])

    try {
      const res = await fetch(`${API_BASE_URL}/model/tensorrt/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onnx_name: selectedOnnx,
          fp16: useFp16,
          workspace_gb: workspaceGb,
          max_batch_size: 1,
        }),
      })
      const data = await res.json()
      setConversionResult(data)

      if (data.logs && Array.isArray(data.logs)) {
        setLogs(data.logs)
      } else if (data.detail) {
        setLogs((prev) => [...prev, `[ERROR] ${data.detail}`])
      }

      // Refresh device info so any newly compiled engine shows up in the inventory
      fetch(`${API_BASE_URL}/model/tensorrt/device-info`)
        .then((r) => r.json())
        .then((fresh) => setDeviceInfo(fresh))
        .catch(() => {})
    } catch (err) {
      setConversionResult({ success: false, error: err.message })
      setLogs((prev) => [...prev, `[EXCEPTION] Compilation failed: ${err.message}`])
    } finally {
      setIsConverting(false)
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCmd(true)
      setTimeout(() => setCopiedCmd(false), 2500)
    })
  }

  const hasCuda = deviceInfo?.cuda_available
  const hasTrt = deviceInfo?.tensorrt_installed

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 10, 20, 0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 680,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 100%)',
          borderRadius: 14,
          border: '1px solid rgba(56, 189, 248, 0.35)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85), 0 0 30px rgba(56, 189, 248, 0.15)',
          color: '#fff',
          padding: '24px 28px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>⚡</span>
              <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '0.02em', margin: 0, color: '#f8fafc' }}>
                TensorRT GPU Engine Compiler
              </h2>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: hasCuda && hasTrt ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                  color: hasCuda && hasTrt ? '#34d399' : '#fbbf24',
                  border: `1px solid ${hasCuda && hasTrt ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
                  textTransform: 'uppercase',
                }}
              >
                {hasCuda && hasTrt ? 'GPU Ready' : 'Edge Profiling'}
              </span>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#94a3b8' }}>
              Compile ONNX neural weights into device-calibrated NVIDIA TensorRT binary engines for maximum subsea ROV throughput.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: 20,
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 6,
            }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Hardware & Environment Card */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 18,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', letterSpacing: '0.05em', marginBottom: 10 }}>
            HOST DEVICE TELEMETRY & ACCELERATOR STATUS
          </div>
          {isLoadingDevice ? (
            <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
              Probing host GPU architecture and TensorRT libraries...
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
              <div style={{ background: 'rgba(0,0,0,0.25)', padding: '8px 10px', borderRadius: 6 }}>
                <div style={{ fontSize: 10, color: '#64748b' }}>TARGET GPU</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {deviceInfo?.device_name || 'Detecting...'}
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.25)', padding: '8px 10px', borderRadius: 6 }}>
                <div style={{ fontSize: 10, color: '#64748b' }}>CUDA COMPUTE</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: hasCuda ? '#34d399' : '#f87171' }}>
                  {hasCuda ? `Enabled (SM ${deviceInfo?.compute_capability || 'OK'})` : 'No CUDA Device'}
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.25)', padding: '8px 10px', borderRadius: 6 }}>
                <div style={{ fontSize: 10, color: '#64748b' }}>TENSORRT RUNTIME</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: hasTrt ? '#34d399' : '#fbbf24' }}>
                  {hasTrt ? `Installed (${deviceInfo?.tensorrt_version})` : 'Not Installed'}
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.25)', padding: '8px 10px', borderRadius: 6 }}>
                <div style={{ fontSize: 10, color: '#64748b' }}>COMPILED ENGINES</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: deviceInfo?.existing_engines?.length > 0 ? '#38bdf8' : '#94a3b8' }}>
                  {deviceInfo?.existing_engines?.length || 0} Available
                </div>
              </div>
            </div>
          )}

          {/* Existing compiled engines badge list */}
          {deviceInfo?.existing_engines?.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>Ready-to-use Compiled Engines:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {deviceInfo.existing_engines.map((eng) => (
                  <div
                    key={eng.name}
                    style={{
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      borderRadius: 6,
                      padding: '4px 8px',
                      fontSize: 11,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span style={{ color: '#38bdf8', fontWeight: 700 }}>{eng.name}</span>
                    <span style={{ color: '#64748b', fontSize: 10 }}>({eng.size_mb} MB)</span>
                    {onSelectEngine && (
                      <button
                        onClick={() => {
                          onSelectEngine('TensorRT')
                          onClose()
                        }}
                        style={{
                          background: '#0284c7',
                          border: 'none',
                          color: '#fff',
                          fontSize: 9,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          cursor: 'pointer',
                        }}
                      >
                        ACTIVATE
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Configuration Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>
              SOURCE ONNX GRAPH
            </label>
            <select
              value={selectedOnnx}
              onChange={(e) => setSelectedOnnx(e.target.value)}
              disabled={isConverting}
              style={{
                width: '100%',
                background: 'rgba(15, 23, 42, 0.9)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#fff',
                padding: '8px 10px',
                borderRadius: 6,
                fontSize: 12,
                outline: 'none',
              }}
            >
              {deviceInfo?.available_onnx?.map((f) => (
                <option key={f.name} value={f.name} style={{ color: '#000' }}>
                  {f.name} ({f.size_mb} MB)
                </option>
              )) || (
                <>
                  <option value="bs-s.onnx" style={{ color: '#000' }}>bs-s.onnx (Deployed S Model)</option>
                  <option value="best.onnx" style={{ color: '#000' }}>best.onnx (Research L Model)</option>
                </>
              )}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>
              PRECISION & ACCELERATION
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setUseFp16(true)}
                disabled={isConverting}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: useFp16 ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                  border: useFp16 ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                  color: useFp16 ? '#38bdf8' : '#94a3b8',
                }}
              >
                FP16 (Tensor Cores)
              </button>
              <button
                type="button"
                onClick={() => setUseFp16(false)}
                disabled={isConverting}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: !useFp16 ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                  border: !useFp16 ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                  color: !useFp16 ? '#38bdf8' : '#94a3b8',
                }}
              >
                FP32 (Standard)
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Optimization Profile Details */}
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px dashed rgba(255, 255, 255, 0.12)',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 18,
            fontSize: 11,
            color: '#94a3b8',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: '#e2e8f0', fontWeight: 600 }}>Dynamic Optimization Profile:</span>
            <span style={{ color: '#38bdf8', fontFamily: 'monospace' }}>images: [1, 3, 640, 640]</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Target Scale Restoration:</span>
            <span style={{ color: '#38bdf8', fontFamily: 'monospace' }}>orig_target_sizes: [1, 2]</span>
          </div>
        </div>

        {/* If host does not have CUDA/TensorRT, show clear edge deployment guide */}
        {(!hasCuda || !hasTrt) && (
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 8,
              padding: '12px 14px',
              marginBottom: 18,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 14 }}>💡</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>
                Edge Deployment Note for NVIDIA Devices
              </span>
            </div>
            <p style={{ fontSize: 11, color: '#e2e8f0', margin: '0 0 8px', lineHeight: 1.5 }}>
              TensorRT compiles machine-code kernels calibrated specifically to the physical Streaming Multiprocessor (SM) architecture of the host NVIDIA GPU (e.g. Jetson Orin Nano, RTX 4090, Tesla T4). To compile on an edge vessel:
            </p>
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.5)',
                padding: '8px 10px',
                borderRadius: 6,
                fontFamily: 'monospace',
                fontSize: 11,
                color: '#38bdf8',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                overflowX: 'auto',
              }}
            >
              <span>{deviceInfo?.cli_command || `python convert_onnx_to_engine.py --onnx weights/${selectedOnnx} --fp16`}</span>
              <button
                type="button"
                onClick={() => copyToClipboard(deviceInfo?.cli_command || `python convert_onnx_to_engine.py --onnx weights/${selectedOnnx} --fp16`)}
                style={{
                  background: copiedCmd ? '#10b981' : 'rgba(56, 189, 248, 0.2)',
                  border: 'none',
                  color: copiedCmd ? '#000' : '#38bdf8',
                  padding: '3px 8px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: 'pointer',
                  marginLeft: 10,
                  whiteSpace: 'nowrap',
                }}
              >
                {copiedCmd ? 'COPIED!' : 'COPY CLI'}
              </button>
            </div>
          </div>
        )}

        {/* Live Compilation Logs Terminal */}
        {logs.length > 0 && (
          <div
            style={{
              background: '#090d16',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              borderRadius: 8,
              padding: '10px 12px',
              maxHeight: 140,
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: 11,
              color: '#34d399',
              marginBottom: 18,
            }}
          >
            {logs.map((logLine, idx) => (
              <div key={idx} style={{ color: logLine.includes('[ERROR]') ? '#f87171' : logLine.includes('[WARNING]') ? '#fbbf24' : '#38bdf8' }}>
                {logLine}
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isConverting}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#cbd5e1',
              padding: '9px 18px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleStartConversion}
            disabled={isConverting}
            style={{
              background: isConverting
                ? 'rgba(56, 189, 248, 0.4)'
                : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              border: '1px solid #38bdf8',
              color: '#fff',
              padding: '9px 20px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: isConverting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.4)',
            }}
          >
            {isConverting ? (
              <>
                <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
                <span>Compiling CUDA Kernels ({elapsedSec}s)...</span>
              </>
            ) : (
              <>
                <span>⚡</span>
                <span>Compile TensorRT Engine</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
