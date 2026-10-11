# Rally — React + Vite project

This is the Rally prototype, converted from a single self-contained HTML
Claude Artifact into a conventional, buildable React + Vite project. This
conversion is a **technical restructuring only** — no screens, flows,
copy, styling, or business logic were redesigned or changed. See
"What could not be preserved exactly" below for the handful of
unavoidable exceptions and why.

## Project structure

```
rally/
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── index.html
├── .gitignore
├── README.md
├── public/                    (empty placeholder — no static assets existed in the original)
└── src/
    ├── main.jsx                React mount entry point (replaces the inline ReactDOM.createRoot/render call)
    ├── index.css               Tailwind directives + the original's small global <style> block
    ├── App.jsx                 The entire application: ~57 components, all constants, all
    │                           business logic, seed data, and the root `App` component
    │                           (was `RallyApp`) — in the same order and shape as the original
    ├── lib/
    │   ├── theme.js            Design tokens (ink, paper, coral, forest, highlighter, fonts, mapBg)
    │   ├── icons.jsx           The hand-built inline-SVG icon set (no external icon library is used)
    │   └── i18n.jsx            LangContext, useLang, the EN/ES STRINGS dictionary, makeT/makeTn
    └── services/
        └── claudeDb.js         Documents the Claude `db` capability contract (see below) —
                                 does not replace or wrap the 24 in-App.jsx call sites
```

## Why App.jsx is still one large file

I extracted the three pieces that are genuinely self-contained and safe
to split mechanically (theme tokens, the icon set, and the i18n layer —
none of these have any circular dependency on the rest of the app).

I deliberately **did not** split the other ~57 components into one file
each. Here's why: I have no network access in this environment, so I
cannot `npm install` Vite and actually run `npm run build` to catch
mistakes a real split would risk introducing (a missed export, a wrong
relative import path, a constant used in one file but only defined in
another). The app's components share a large web of constants and
helpers (`COUNTRIES`, `CITY_COORDS`, `HELP_QA`, `matchesDiscoverFilters`,
etc.) with no module boundaries in the original — faithfully splitting
that by hand, without a compiler to check my work, is exactly the kind
of change that could silently break something. Keeping them together in
one file — just wrapped in proper ES module syntax instead of a global
`<script>` scope — is the lowest-risk way to hit "proper buildable
project" without gambling on an unverifiable refactor. Splitting
`App.jsx` further into a `components/` tree is a very reasonable next
step, but one that should happen with a working `npm run dev` loop open
next to it, which I don't have here.

## What actually changed, mechanically

- The four CDN `<script>` tags (Tailwind Play CDN, React UMD, ReactDOM
  UMD, Babel Standalone) are gone. React and ReactDOM are now real npm
  dependencies; Tailwind is a real local build (see `tailwind.config.js`
  / `postcss.config.js`); Babel Standalone is gone entirely — Vite's
  `@vitejs/plugin-react` handles JSX at dev-server and build time.
- The global destructure `const { useState, useEffect, useRef, useContext, createContext } = React;`
  is gone, replaced with real ES `import` statements.
- `function RallyApp()` → `export default function App()`. No internal
  renaming beyond that.
- The closing `ReactDOM.createRoot(...).render(<RallyApp />)` line moved
  out of the component file and into `src/main.jsx`, which is where it
  belongs in a normal React project.
- Every other line of logic, JSX, class name, inline style, and piece of
  copy is byte-for-byte the same as the artifact — I extracted by
  slicing the original source at exact line boundaries (not retyping by
  hand), specifically to avoid introducing transcription errors.

## Dependencies

No icon library was needed — the original app already used a hand-built
inline SVG icon set (`ICON_PATHS` + a generic `Icon` component), which
has zero external dependencies beyond React itself. No other runtime
library (no charting, date, or animation library) is used anywhere in
the app. The full dependency list:

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "vite": "^5.3.1"
  }
}
```

React/ReactDOM are pinned to `^18.2.0` to match the exact version the
artifact was loading from the CDN — I did not take the opportunity to
move to React 19 as part of this "no redesign" step.

### Tailwind

The app never uses Tailwind's color utilities (`bg-red-500` and
similar) — every custom color (`ink`, `paper`, `coral`, etc.) is applied
via inline `style={{...}}`, not Tailwind classes. I confirmed this by
grepping the entire original file for any `bg-/text-/border-<color>-<n>`
pattern: zero matches. That means `tailwind.config.js` needs **no theme
customization at all** — stock Tailwind, scoped to `index.html` and
`src/**/*.{js,jsx}`, reproduces every utility class the app actually
uses (including arbitrary-value classes like `text-[11px]`, `w-[30px]`,
which Tailwind v3's JIT engine supports natively, same as the Play CDN
build did).

## Claude-specific dependency that remains (critical)

**`claude.use("db")`** — Rally's live data (events, attendees,
notifications, per-account preferences/follows) is read and written
through a global `claude` object that is injected only when this page
runs inside a published Claude Artifact. This is the single biggest
thing standing between this project and a standalone app.

- It does not exist in: this Vite dev server, the production build
  output, a normal browser tab, or a future Capacitor/iOS/Android shell.
- It is called directly in **~24 places** inside `src/App.jsx`. You can
  find every one of them by searching the file for `dbRef.current`.
  They cover: the initial connection + seeding + live subscriptions
  (`useEffect` blocks near the top of `App`), creating/approving/
  declining/cancelling events, joining/leaving events, following
  creators, editing/deleting accounts, and the notification inbox.
- `src/services/claudeDb.js` documents this contract (the three
  collections it uses — `events`, `userPrefs`, `notifications` — and
  their shapes) and provides `isClaudeDbAvailable()` /
  `connectClaudeDb()` as the seam a real backend integration will
  replace. It intentionally does **not** attempt to fake, polyfill, or
  silently replace this — per your instructions, that's explicitly a
  later step, once a real backend (Supabase/Firebase/custom) is chosen.
- Current behavior is preserved exactly: run this app anywhere outside
  a Claude Artifact today, and `isClaudeDbAvailable()` (and the
  equivalent check already inside `App.jsx`) returns false, and the app
  correctly falls back to its existing "Live sync isn't available here"
  screen — the same screen it already shows today if the capability
  ever failed to connect inside the Artifact. I did not add this
  fallback; it already existed in the original code specifically for
  this scenario, and it's still exactly what a plain `npm run dev` will
  show you right now.

## Browser APIs that are *not* Claude-specific (good news)

I checked these carefully since they could easily be mistaken for
platform-specific code. They are all **standard Web APIs** that work
identically in a plain Vite app, and need no special handling at this
stage:

- `navigator.geolocation.getCurrentPosition` (Topics page's "Share your
  location", and the same control inside event creation)
- `window.open(...)` (opening Google Maps)
- `Notification.requestPermission()` / `new Notification(...)` (the
  Profile page's push-notification toggle, and the approve/follow
  notification triggers) — same known limitation as before: this works
  on Android Chrome and desktop browsers, and does **not** work at all
  on iOS Safari (confirmed in-conversation; iOS doesn't implement this
  API in any context, only a separate Web Push + service-worker path on
  an installed PWA, which is out of scope here)
- `localStorage` (remembering the EN/ES language choice)

None of these required rewriting. They'll matter again once Capacitor
enters the picture (geolocation and notifications usually move to
Capacitor plugins for proper native behavior), but that's explicitly a
later step.

## What could not be preserved exactly (and why)

1. **File boundaries.** The original had zero file boundaries (one
   `<script>` tag). Any split at all is, strictly speaking, a structural
   change the original didn't have — but you explicitly asked for a
   "proper, buildable React + Vite project," which requires at least
   `main.jsx` + `App.jsx` as separate files. I kept the split to the
   minimum I could verify safely (see above).
2. **`React.StrictMode`** — I wrapped `<App />` in `main.jsx` with it,
   which is the Vite React template's default. It's a development-only
   aid (double-invokes some functions in dev to surface side-effect
   bugs) and has **zero effect on the production build**. The
   `useEffect` cleanup functions in `App.jsx` already correctly
   unsubscribe, so this should be a no-op in practice — but if you want
   byte-for-byte dev-mode behavior too, delete the `<React.StrictMode>`
   wrapper in `src/main.jsx`.
3. **Nothing else.** I did not find any other unavoidable deviation —
   no copy, class name, style, icon, or business rule was changed.

## Verification performed (and its limits)

I do not have network access in this environment, so I could not run
`npm install` against the real npm registry, and therefore could not
run a real `npm run dev` or `npm run build` to prove this compiles
end-to-end the way you'd see it. I want to be direct about that rather
than claim more than I verified.

What I *could* and did verify, using Node and a locally-cached
React/ReactDOM (via esbuild-based transforms, not Vite itself):

- Every file (`App.jsx`, the three `lib/` modules, `services/claudeDb.js`)
  parses and transforms as valid JS/JSX with **zero syntax errors**.
- `App.jsx` evaluates at module scope with **zero reference errors** —
  every import resolves, nothing is undefined.
- I rendered `<App />` through `react-dom/server`'s `renderToString`
  end-to-end and it **produced correct output with zero runtime
  errors** — specifically the expected initial shell (the phone-frame
  mock, 390×844, correct inline styles) falling back correctly to the
  "Live sync isn't available here" state, exactly as it should when no
  `claude` global exists — which is precisely the situation this
  project will be in every time you run it locally.
- I confirmed (by grep) there are no Tailwind color-utility classes
  needing theme config, and no other third-party runtime library
  (no chart/date/animation package) used anywhere in the app.

What I could **not** verify: the actual `vite`/`tailwindcss`/
`autoprefixer`/`@vitejs/plugin-react` packages installing and running
together from a clean `npm install`, visual/pixel output in a real
browser, and interactive behavior (clicking through screens). These are
standard, extremely widely-used packages at ordinary pinned versions, so
I'd be surprised by a real install issue — but "surprised" isn't the
same as "verified," and you asked me not to claim the latter without
checking.

## Commands

```bash
npm install     # fetch react, react-dom, vite, tailwindcss, etc.
npm run dev     # start the Vite dev server
npm run build   # production build to dist/
npm run preview # serve the production build locally, for a final check
```

Please run `npm install && npm run dev` as the very next step and tell
me what you see / any errors — that will be the first real build-time
verification this project gets, and I'd rather fix something now than
have it surface later in the Capacitor step.
