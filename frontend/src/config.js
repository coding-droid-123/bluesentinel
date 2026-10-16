/**
 * Application Configuration
 * Provides centralized backend API and WebSocket endpoints with environment variable overrides.
 */

export const API_BASE_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:8000'
).replace(/\/+$/, '');

export const WS_BASE_URL = (
  import.meta.env.VITE_WS_URL || API_BASE_URL.replace(/^http/, 'ws')
).replace(/\/+$/, '');
