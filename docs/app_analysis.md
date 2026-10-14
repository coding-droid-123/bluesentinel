# 🌊 Blue Sentinel — What It Does & How to Improve It

## What the App Does

**Blue Sentinel** is an AI-powered marine debris detection and ecological audit system. It has a **React 19 + Vite + Tailwind v4** frontend and a **FastAPI + PyTorch/ONNX** backend with **PostgreSQL 18 + pgvector**.

### Core Workflows

| Page | Purpose |
|---|---|
| **Home** | Landing page with hero, capability cards, upload dropzone, pipeline explainer, and alert logic docs |
| **Upload / Dashboard** | Upload a single underwater image → run RT-DETRv4 inference → view annotated bounding boxes, severity, confidence, and per-object breakdown |
| **ROV Simulator** | Load a video file → step-through or continuous frame extraction → per-frame inference with Multi-Object Tracking (IoU), bounding box canvas overlay, real-time alerts (ghost gear, entanglement, large piles), pile ranking, and a live Schematic Hotspot Map |
| **Batch Stream** | Upload a batch of named image frames → stream them through a WebSocket to the backend → view live detections, filmstrip gallery, alert log, and pile/hotspot ranking |
| **Cleanup Optimizer** | Compare surveyed zones by estimated cleanup crew-hours, equipment, and cost ranges with editable assumptions; dispatch plans to the database |
| **About** | Project info, tech stack, team credits |
| **Report Panel** | Modal that generates a printable PDF audit report (html2canvas → jsPDF) |

---

## Improvement Areas (No New Features)

### 🔴 Critical — Code Quality & Correctness

| # | Issue | Location | Impact | Fix |
|---|---|---|---|---|
| 1 | **Massive code duplication** — `drawBoxes()` is copy-pasted identically (~80 lines) in both [ROVSimulator.jsx](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/components/ROVSimulator.jsx) and [BatchStreamPage.jsx](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/components/BatchStreamPage.jsx). Same for `getColor()`, `CLASS_COLORS`, `SEVERITY_COLOR`, `SEVERITY_BG`. | ROVSimulator, BatchStreamPage | Bug risk: fixing a rendering bug in one place but not the other | Extract into a shared `utils/drawing.js` module |
| 2 | **Navbar duplicated 6 times** — Every page (`HomePage`, `UploadPage` ×2 states, `ROVSimulator`, `BatchStreamPage`, `CleanupOptimizer`, `AboutPage`) re-implements the same nav bar with inline styles. | All components | Inconsistency, maintenance burden | Extract a shared `<NavBar page={…} onNavigate={…} />` component |
| 3 | **No routing library** — Pages are conditionally rendered via `if (page === 'rov') return …` in [App.jsx](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/App.jsx#L113-L117). Browser URL never changes, so **Back/Forward buttons don't work**, deep-linking is impossible, and all state is lost on refresh. | App.jsx L113-117 | Broken navigation UX | Add `react-router-dom` with route-based rendering |
| 4 | **`DetectionPanel.jsx` is dead code** — It imports Tailwind utility classes (`flex`, `grid`, `bg-white`, `text-xs`, etc.) but the app now uses [UploadPage.jsx](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/components/UploadPage.jsx) instead. `DetectionPanel` is never imported or rendered anywhere. | [DetectionPanel.jsx](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/components/DetectionPanel.jsx) | Confusing for maintainers, dead weight | Remove the file or integrate it properly |
| 5 | **`AuthModal.jsx` is dead code** — An authentication modal component exists but is never imported or used. | [AuthModal.jsx](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/components/AuthModal.jsx) | Dead weight | Remove or wire it up |
| 6 | **Module-scoped mutable ref** — `entanglementPersistenceRef` at [ROVSimulator.jsx L36](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/components/ROVSimulator.jsx#L36) is declared outside the component. If React strict mode double-mounts or the component is re-mounted, this persists stale state. | ROVSimulator.jsx L36 | Subtle tracking bugs | Move into a `useRef()` inside the component (the actual `entanglePersRef` on L234 is correct; remove the orphaned module-level one) |
| 7 | **`@vitejs/plugin-react` listed in both `dependencies` AND `devDependencies`** | [package.json](file:///c:/Users/user/Desktop/blueSent-FE/frontend/package.json#L13) | Build tools shipping to production | Move to `devDependencies` only. Also `vite`, `autoprefixer`, `postcss.config.js` belong in devDependencies |

### 🟠 Major — Performance

| # | Issue | Location | Impact | Fix |
|---|---|---|---|---|
| 8 | **ROVSimulator.jsx is 1249 lines** — Alert logic, MOT tracking, hotspot aggregation, canvas drawing, playback controls, and the entire UI are in one monolithic file. | [ROVSimulator.jsx](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/components/ROVSimulator.jsx) | Impossible to test, hard to maintain | Split into: `useROVInference` (hook), `useMultiObjectTracker` (hook), `ROVControls`, `AlertLog`, `PileRanking`, `VideoCanvas` components |
| 9 | **BatchStreamPage.jsx is 910 lines** — Same monolith problem. | [BatchStreamPage.jsx](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/components/BatchStreamPage.jsx) | Same | Same decomposition approach |
| 10 | **Annotated images sent as base64 in JSON** — The `/detect` response embeds the full annotated JPEG as a base64 string inside JSON. For a 2 MB image, this is ~2.7 MB of JSON text. | App.jsx L54, backend main.py | Slow response parsing, high memory | Return the image URL (`/uploads/...`) instead; the backend already saves the file |
| 11 | **No `React.memo` / `useMemo` on expensive renders** — The filmstrip in BatchStreamPage re-renders all thumbnails on every frame update. Detection lists re-render fully. | BatchStreamPage, UploadPage | Jank on large batches | Memoize child components and computed data |
| 12 | **Object URLs are never revoked** in ROVSimulator on cleanup | ROVSimulator.jsx | Memory leak with repeated video loads | Add cleanup in `useEffect` return / `handleReset` |

### 🟡 Moderate — UX & Accessibility

| # | Issue | Location | Impact | Fix |
|---|---|---|---|---|
| 13 | **Zero responsive design for mobile** — Feature card grids use `repeat(3,1fr)` / `repeat(4,1fr)` with no breakpoints. The Home page "How it works" and "Alert Logic" sections break on narrow screens. | [HomePage.jsx L117, L200, L222](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/components/HomePage.jsx#L117) | Unusable on phones/tablets | Add media queries or use CSS `auto-fill` / `auto-fit` |
| 14 | **Excessive inline styles** — Hundreds of `style={{…}}` objects are created on every render across all components. This defeats CSS caching, makes the DOM inspector painful, and creates new objects each render. | All components | Performance, maintainability | Move to CSS classes in `index.css` or CSS modules |
| 15 | **No keyboard navigation** — Buttons and interactive elements lack `aria-label`, focus styles, or keyboard shortcuts. The ROV playback controls have no shortcut keys. | All components | Accessibility failure | Add `aria-*` attributes, visible focus rings, keyboard handlers |
| 16 | **No loading/error states for Optimizer zone fetch** — If the backend is down, the Optimizer silently falls back to hardcoded demo data with no indication to the user. | [CleanupOptimizer.jsx L93-121](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/components/CleanupOptimizer.jsx#L93) | Confusing: user sees demo data thinking it's real | Show a banner: "Live database unavailable — showing demo data" |
| 17 | **No `<title>` or meta tags** — The HTML `<head>` has no descriptive title, meta description, or Open Graph tags. | [index.html](file:///c:/Users/user/Desktop/blueSent-FE/frontend/index.html) | Poor SEO and tab identification | Add proper `<title>`, `<meta name="description">`, favicon |
| 18 | **Hardcoded `localhost:8000`** — The backend URL is hardcoded in **7+ places** across multiple components. | App.jsx, ROVSimulator, BatchStreamPage, CleanupOptimizer, useBatchStream | Can't deploy to any other environment | Extract to a single `config.js` or use `import.meta.env.VITE_API_URL` |

### 🟢 Minor — Polish

| # | Issue | Location | Impact | Fix |
|---|---|---|---|---|
| 19 | **Mixed line endings** — Some files use `\r\n` (Windows), others use `\n` (Unix). | UploadPage, ReportPanel vs App.jsx | Git diff noise | Add `.editorconfig` and normalize |
| 20 | **No error boundary** — A runtime error in any component crashes the entire app with a white screen. | App.jsx | Complete app failure | Add a `<ErrorBoundary>` with a recovery UI |
| 21 | **Console warnings** — `fetch` calls in fire-and-forget patterns (like incident logging) have `.catch(() => {})` but some paths swallow errors silently. | ROVSimulator.jsx L428-431 | Hard to debug in production | Add structured logging or at least `console.warn` consistently |
| 22 | **CSS `!important` overuse** — Multiple selectors use `!important` to fight specificity battles in [index.css](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/index.css#L1117-L1122). | index.css L507, L802, L924, L1102, L1117-1122 | Fragile styling, hard to override | Restructure CSS specificity instead |
| 23 | **`postcss.config.js` exists but PostCSS isn't configured for Tailwind v4** — Tailwind v4 uses `@tailwindcss/vite` plugin directly, making the PostCSS config file unnecessary. | postcss.config.js | Confusing, potentially conflicting | Remove if unused |

---

## Recommended Priority Order

> [!IMPORTANT]
> These are sorted by **impact-to-effort ratio** — quick wins first.

1. **Extract `API_BASE_URL` to config** (#18) — 10 min, fixes deployment blocker
2. **Delete dead code** (`DetectionPanel.jsx`, `AuthModal.jsx`) (#4, #5) — 2 min
3. **Fix package.json** deps placement (#7) — 2 min
4. **Add `<title>` and meta tags** (#17) — 5 min
5. **Extract shared `drawBoxes` + constants** (#1) — 30 min
6. **Extract `<NavBar>` component** (#2) — 30 min
7. **Add `<ErrorBoundary>`** (#20) — 15 min
8. **Add Optimizer connection status banner** (#16) — 15 min
9. **Move inline styles to CSS classes** (#14) — 2-3 hours (incremental)
10. **Split ROVSimulator.jsx** into smaller modules (#8) — 2-3 hours
11. **Add `react-router-dom`** (#3) — 1-2 hours
12. **Add responsive breakpoints** (#13) — 1-2 hours
13. **Return image URL instead of base64** (#10) — 30 min (backend + frontend change)
