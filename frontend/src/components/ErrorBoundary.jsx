import React from 'react'

/**
 * Enterprise Error Boundary component
 * Catches JavaScript errors anywhere in their child component tree,
 * logs those errors, and displays a graceful fallback UI instead of crashing the entire page.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    console.error('Blue Sentinel ErrorBoundary caught an exception:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    if (this.props.onReset) {
      this.props.onReset()
    } else {
      window.location.reload()
    }
  }

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#071524',
            color: '#e2e8f0',
            fontFamily: "'Inter', system-ui, sans-serif",
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              maxWidth: 580,
              width: '100%',
              backgroundColor: '#0c2238',
              border: '1px solid #1e3a5f',
              borderRadius: 16,
              padding: '36px 28px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            }}
          >
            <div
              style={{
                fontSize: 48,
                marginBottom: 16,
              }}
            >
              🌊⚠️
            </div>

            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: '#38bdf8',
                marginBottom: 8,
              }}
            >
              System Interface Interrupted
            </h1>

            <p
              style={{
                fontSize: 14,
                color: '#94a3b8',
                lineHeight: 1.6,
                marginBottom: 20,
              }}
            >
              An unexpected error occurred while rendering this telemetry module. Your underlying data is safe.
            </p>

            {this.state.error && (
              <div
                style={{
                  backgroundColor: '#051322',
                  border: '1px solid #0f2c4a',
                  borderRadius: 8,
                  padding: '12px 14px',
                  textAlign: 'left',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: '#f87171',
                  overflowX: 'auto',
                  maxHeight: 140,
                  marginBottom: 24,
                }}
              >
                {this.state.error.toString()}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                gap: 12,
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: 13,
                  padding: '10px 20px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'opacity 0.2s',
                }}
              >
                Reload Module
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  color: '#cbd5e1',
                  border: '1px solid rgba(255,255,255,0.15)',
                  fontWeight: 600,
                  fontSize: 13,
                  padding: '10px 20px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'opacity 0.2s',
                }}
              >
                Return to Home
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
