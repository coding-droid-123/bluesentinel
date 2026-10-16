# 🌊 Blue Sentinel — Architecture Analysis (Current State)

> Last updated: October 2026 — reflects the **current codebase**, not the original draft.

---

## What the App Does

**Blue Sentinel** is an AI-powered marine debris detection and ecological audit system. It has a **React 19 + Vite** frontend and a **FastAPI + PyTorch/ONNX** backend with **SQLite** (local dev) / **PostgreSQL 18 + pgvector** (production).

### Core Pages

| Page | Route Key | Purpose |
|---|---|---|
| **Home** | `home` | Landing page with hero, capability cards, upload dropzone, pipeline explainer, and alert logic docs |
| **Upload / Dashboard** | `dashboard` | Upload a single underwater image → run RT-DETRv4 inference → view annotated bounding boxes, severity, confidence, and per-object breakdown |
| **ROV Simulator** | `rov` | Load a video file → step-through or continuous frame extraction → per-frame inference with Multi-Object Tracking (IoU), bounding box canvas overlay, real-time alerts (ghost gear, entanglement, large piles), pile ranking, and a live Schematic Hotspot Map |
| **Cleanup Optimizer** | `optimizer` | Compare surveyed zones by estimated cleanup crew-hours, equipment, and cost ranges with editable assumptions; dispatch plans to the database |
| **History** | `history` | Browse and filter all past scan sessions (image, ROV, batch) stored in `localStorage` via `useHistory` hook |
| **About** | `about` | Project info, tech stack, team credits |
| **Report Panel** | _(modal)_ | Generates a printable PDF audit report (html2canvas → jsPDF), rendered as a modal overlay on the Dashboard page |

> **Note:** The **Batch Stream** page has been **removed** from the app. `App.jsx` no longer renders or imports it, and no route exists for it. `BatchStreamPage.jsx` no longer exists in the components directory.

---

## Current File Structure

```
frontend/src/
├── main.jsx                  # Entry point — wraps <App> in <ErrorBoundary>
├── App.jsx                   # Root router (page-state machine, session persistence)
├── config.js                 # Centralised API_BASE_URL + WS_BASE_URL (env-var aware)
├── index.css                 # Global design system (tokens, utilities, component styles)
├── components/
│   ├── NavBar.jsx            # ✅ Shared navigation bar (used by all pages)
│   ├── ErrorBoundary.jsx     # ✅ Catches runtime errors app-wide (mounted in main.jsx)
│   ├── HomePage.jsx          # Landing page
│   ├── UploadPage.jsx        # Single-image scan dashboard
│   ├── ROVSimulator.jsx      # Video playback + per-frame inference + hotspot map
│   ├── SchematicMap.jsx      # Standalone hotspot map component (used by ROVSimulator)
│   ├── CleanupOptimizer.jsx  # Zone-based cleanup cost estimator
│   ├── HistoryPage.jsx       # Scan history browser
│   ├── AboutPage.jsx         # About / credits
│   ├── ReportPanel.jsx       # PDF report modal (used by UploadPage via App.jsx)
│   ├── ImageUploader.jsx     # Reusable drag-and-drop file picker
│   └── LoadingOverlay.jsx    # Full-screen loading spinner
├── hooks/
│   └── useHistory.js         # localStorage-backed scan history (read + write)
└── utils/
    ├── drawing.js            # ✅ Shared: drawBoxes(), CLASS_COLORS, SEVERITY_COLOR, getColor(), boxIoU()
    └── alerts.js             # ✅ Shared: evaluateAlerts(), weightedScore()
```

---

## Routing Architecture

Navigation is implemented as a **page-state machine** in `App.jsx`:

- **State**: `const [page, setPage] = useState(...)` — persisted to `sessionStorage`
- **Rendering**: All pages remain mounted using `display: none / block` — state is **never lost** on tab switch
- **Navigation**: `handleNavigate(targetPage, data?)` callback passed as `onNavigate` prop to every page
- **No `react-router-dom`** — browser Back/Forward don't work; deep-linking is impossible

```
App.jsx
 ├── <HomePage onNavigate />
 ├── <UploadPage onNavigate />  +  <ReportPanel />  +  <LoadingOverlay />
 ├── <ROVSimulator onNavigate />
 ├── <CleanupOptimizer onNavigate />
 ├── <HistoryPage onNavigate />
 └── <AboutPage onNavigate />
```

---

## What Has Been Fixed Since the Original Analysis

| # | Issue | Status |
|---|---|---|
| 1 | **Shared `drawBoxes` + constants** | ✅ **Done** — `utils/drawing.js` centralises `drawBoxes`, `CLASS_COLORS`, `SEVERITY_COLOR`, `SEVERITY_BG`, `getColor`, `boxIoU`, `GHOST_GEAR`, `ANIMALS`, `CLASS_WEIGHT` |
| 2 | **Navbar duplicated across pages** | ✅ **Done** — `components/NavBar.jsx` is used by all 6 page components |
| 3 | **`DetectionPanel.jsx` dead code** | ✅ **Done** — File removed from components directory |
| 4 | **`AuthModal.jsx` dead code** | ✅ **Done** — File removed from components directory |
| 5 | **Batch Stream page dead/orphaned** | ✅ **Done** — `BatchStreamPage.jsx` removed; no route exists for it |
| 6 | **Hardcoded `localhost:8000`** | ✅ **Done** — `config.js` exports `API_BASE_URL` and `WS_BASE_URL` with `VITE_API_URL` / `VITE_WS_URL` env overrides; only the config default still references localhost |
| 7 | **No `<ErrorBoundary>`** | ✅ **Done** — `ErrorBoundary.jsx` wraps `<App>` in `main.jsx`; shows themed fallback UI with Reload/Home actions |
| 8 | **`useHistory` hook + History page** | ✅ **Added** — `hooks/useHistory.js` persists scan sessions to `localStorage`; `HistoryPage.jsx` provides a full browse/filter/delete UI |
| 9 | **`utils/alerts.js`** | ✅ **Added** — `evaluateAlerts()` and `weightedScore()` extracted into a shared utility |

---

## Remaining Issues

### 🔴 Critical

| # | Issue | Location | Impact | Fix |
|---|---|---|---|---|
| 1 | **No routing library** — `page` state in `App.jsx` never changes the URL. Back/Forward buttons don't work, deep-linking is impossible, and all state is lost on hard refresh. | [App.jsx](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/App.jsx#L17-L24) | Broken browser navigation UX | Add `react-router-dom` with route-based rendering |
| 2 | **`ROVSimulator.jsx` is monolithic** — Alert logic, MOT tracking, hotspot aggregation, canvas drawing, playback controls, and the full UI are in one file. | [ROVSimulator.jsx](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/components/ROVSimulator.jsx) | Untestable, hard to maintain | Split into `useROVInference`, `useMultiObjectTracker`, `ROVControls`, `AlertLog`, `VideoCanvas` |
| 3 | **Annotated images sent as base64 in JSON** — `/detect` response embeds the full annotated JPEG as a base64 string inside JSON. For a 2 MB image this is ~2.7 MB of text. | [App.jsx L80](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/App.jsx#L80), `backend/main.py` | Slow parsing, high memory | Return an image URL (`/uploads/...`) instead; backend already saves the file |

### 🟠 Major — Performance

| # | Issue | Location | Impact | Fix |
|---|---|---|---|---|
| 4 | **Color maps re-declared locally** — `SchematicMap.jsx` and some parts of `UploadPage.jsx` define their own local color/severity maps instead of importing from `utils/drawing.js` | [SchematicMap.jsx](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/components/SchematicMap.jsx), [UploadPage.jsx](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/components/UploadPage.jsx) | Minor duplication risk | Import `SEVERITY_COLOR`, `SEVERITY_BG` from `utils/drawing` uniformly across all components |
| 5 | **No `React.memo` / `useMemo` on expensive renders** — Detection lists and history cards re-render fully on every state change | HistoryPage, UploadPage | Jank on large record sets | Memoize child components and computed data |
| 6 | **Object URLs are never revoked** in ROVSimulator on cleanup | [ROVSimulator.jsx](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/components/ROVSimulator.jsx) | Memory leak with repeated video loads | Add cleanup in `useEffect` return / `handleReset` |

### 🟡 Moderate — UX & Accessibility

| # | Issue | Location | Impact | Fix |
|---|---|---|---|---|
| 7 | **Zero responsive design for mobile** — Feature card grids use `repeat(3,1fr)` / `repeat(4,1fr)` with no breakpoints | [HomePage.jsx](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/components/HomePage.jsx) | Unusable on phones/tablets | Add media queries or CSS `auto-fit` |
| 8 | **Excessive inline styles** — `style={{…}}` objects are created on every render throughout all components | All components | Performance, maintainability, DOM inspector noise | Move to CSS classes in `index.css` or CSS modules |
| 9 | **No keyboard navigation / ARIA** — Buttons lack visible focus rings; ROV playback controls have no keyboard shortcuts | All components | Accessibility failure | Add `aria-*` attributes, focus rings, keyboard handlers |
| 10 | **No loading/error state for Optimizer zone fetch** — If backend is down, silently falls back to hardcoded demo data | [CleanupOptimizer.jsx](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/components/CleanupOptimizer.jsx) | Misleading UX | Show a banner: "Live database unavailable — showing demo data" |
| 11 | **No `<title>` or meta tags** — `index.html` has no descriptive title, meta description, or Open Graph tags | [index.html](file:///c:/Users/user/Desktop/blueSent-FE/frontend/index.html) | Poor SEO and tab identification | Add `<title>`, `<meta name="description">`, favicon |

### 🟢 Minor — Polish

| # | Issue | Location | Impact | Fix |
|---|---|---|---|---|
| 12 | **No per-page error boundary** — `ErrorBoundary` wraps the entire app, so a crash in ROV Simulator takes down the whole UI | [main.jsx](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/main.jsx) | Full app white-screen on any page crash | Wrap each page slot in its own `<ErrorBoundary>` in App.jsx |
| 13 | **Console warnings** — Some `fetch` fire-and-forget calls swallow errors silently with `.catch(() => {})` | [ROVSimulator.jsx](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/components/ROVSimulator.jsx) | Hard to debug in production | Use `console.warn` consistently |
| 14 | **CSS `!important` overuse** in `index.css` | [index.css](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/index.css) | Fragile styling | Restructure CSS specificity |
| 15 | **`useHistory` has no record cap** — History records in `localStorage` accumulate indefinitely with no max-size guard | [useHistory.js](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/hooks/useHistory.js) | Storage quota exceeded over time | Cap records (e.g. 200 max) and/or migrate to IndexedDB |

---

## Recommended Priority Order

> [!IMPORTANT]
> Sorted by **impact-to-effort ratio** — quick wins first.

1. **Add `<title>` and meta tags** (#11) — 5 min
2. **Per-page `<ErrorBoundary>` wrapping** (#12) — 10 min
3. **Add Optimizer connection status banner** (#10) — 15 min
4. **Revoke object URLs in ROVSimulator** (#6) — 15 min
5. **Cap `useHistory` records** (#15) — 20 min
6. **Consolidate color maps into `utils/drawing.js`** (#4) — 30 min
7. **Move inline styles to CSS classes** (#8) — 2–3 hours (incremental)
8. **Split `ROVSimulator.jsx`** into smaller modules (#2) — 2–3 hours
9. **Add `react-router-dom`** (#1) — 1–2 hours
10. **Return image URL instead of base64** (#3) — 30 min (backend + frontend change)
11. **Add responsive breakpoints** (#7) — 1–2 hours
