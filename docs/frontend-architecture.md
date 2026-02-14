# Frontend Architecture Guide

This document walks through the structure of the Tournament Trading Dashboard frontend, a React + TypeScript single-page application. It's written for someone comfortable with backend code but new to modern frontend patterns.

---

## Table of Contents

1. [Quick Orientation](#quick-orientation)
2. [Build System & Dev Workflow](#build-system--dev-workflow)
3. [Entry Point & App Shell](#entry-point--app-shell)
4. [The Three Pillars of State](#the-three-pillars-of-state)
5. [API Layer](#api-layer)
6. [Custom Hooks (the glue)](#custom-hooks-the-glue)
7. [Component Tour](#component-tour)
8. [Data Flow Walkthrough](#data-flow-walkthrough)
9. [Styling](#styling)
10. [Key Patterns & Conventions](#key-patterns--conventions)

---

## Quick Orientation

```
web/src/
├── main.tsx                 # Entry point - mounts React
├── App.tsx                  # Root component - providers + layout shell
├── index.css                # Tailwind imports + global styles
├── types/index.ts           # All TypeScript interfaces (the "schema")
├── api/                     # HTTP client layer (talks to backend)
│   ├── client.ts            #   Base fetch wrapper + what-if param encoding
│   ├── tournament.ts        #   /tournament/* endpoints
│   ├── portfolio.ts         #   /portfolio/* endpoints
│   ├── analysis.ts          #   /analysis/* endpoints
│   └── market.ts            #   /market/* endpoints
├── hooks/                   # Custom React hooks (connect state → API → components)
│   ├── useTournament.ts     #   Tournament data hooks
│   ├── usePortfolio.ts      #   Portfolio data hooks
│   └── useMarket.ts         #   Market data hooks
├── store/
│   └── uiStore.ts           # Zustand store - all client-side UI state
├── utils/
│   └── bracketTree.ts       # Helper functions for navigating bracket tree
└── components/
    ├── Dashboard/            # Main view container + sub-views
    │   ├── Dashboard.tsx     #   Tab switcher + view routing
    │   ├── PortfolioSummary.tsx  # Portfolio EV, histogram, percentiles
    │   ├── TeamsTable.tsx    #   Sortable table of teams with positions
    │   └── GameImportanceTable.tsx  # Upcoming games ranked by impact
    ├── Bracket/
    │   ├── BracketView.tsx   #   D3-based SVG bracket (1588 lines, the big one)
    │   └── MetaTeamModal.tsx #   Modal for selecting teams in bracket slots
    ├── TeamPanel/
    │   └── TeamPanel.tsx     #   Right sidebar for team details
    ├── GamePanel/
    │   └── GamePanel.tsx     #   Right sidebar for game analysis
    ├── WhatIf/
    │   ├── WhatIfTool.tsx    #   Scenario builder UI
    │   ├── ScenarioSelector.tsx  # Create/switch/delete scenarios
    │   └── OverridesList.tsx #   Displays active what-if overrides
    ├── CompletedGames/
    │   └── CompletedGamesView.tsx  # Record tournament results
    ├── TeamDetail/
    │   ├── TeamDetailView.tsx     # Full-page team analysis + trade simulator
    │   ├── OrderBook.tsx          # Bid/ask display
    │   └── MarketMakerControls.tsx # Place/update market quotes
    └── common/
        └── SortableTable.tsx  # Reusable sort header + sort logic
```

Think of the data flow as a pipeline: **Backend API → API layer → React Query (cache) → Custom hooks → Components → Zustand (UI state)**. The rest of this document walks through each layer.

---

## Build System & Dev Workflow

**Framework:** [Vite](https://vite.dev) — a fast build tool / dev server for modern JS. Think of it as the equivalent of `cargo` for the frontend world: it compiles TypeScript, bundles modules, and serves hot-reloading in dev.

**Key config files:**

| File | Purpose |
|------|---------|
| [`web/package.json`](../web/package.json) | Dependencies and scripts (`npm run dev`, `npm run build`) |
| [`web/vite.config.ts`](../web/vite.config.ts) | Dev server proxy: routes `/api/*` to the Python backend on port 8000 |
| [`web/tsconfig.json`](../web/tsconfig.json) | TypeScript compiler settings |
| [`web/tailwind.config.js`](../web/tailwind.config.js) | CSS framework config |

**Core dependencies (from [`package.json:12-18`](../web/package.json)):**

| Library | Version | What it does |
|---------|---------|--------------|
| `react` | 19.2.0 | UI component library |
| `@tanstack/react-query` | 5.90.20 | Server state management (data fetching, caching) |
| `zustand` | 5.0.11 | Client state management (UI state) |
| `d3` | 7.9.0 | Data visualization (bracket SVG) |
| `tailwindcss` | 3.4.19 | Utility-first CSS framework |

**Running locally:**

```bash
cd web
npm install      # Install JS dependencies (one time)
npm run dev      # Start dev server (typically on port 5173/5174)
```

The dev server proxies `/api/*` requests to `localhost:8000` (your Python backend) — see [`vite.config.ts:9-15`](../web/vite.config.ts). This means the frontend makes requests like `fetch('/api/v1/tournament/teams')` and Vite forwards them to the backend. No CORS headaches.

---

## Entry Point & App Shell

### `main.tsx` — The bootstrap

[`web/src/main.tsx`](../web/src/main.tsx) — 10 lines. Creates the React root and mounts `<App />` inside `<StrictMode>` (a development helper that catches common bugs).

### `App.tsx` — Provider setup + layout

[`web/src/App.tsx`](../web/src/App.tsx) — 60 lines. Two nested components:

**`App` (line 52)** — Sets up the `QueryClientProvider`, which gives all descendant components access to React Query's caching layer. The `QueryClient` is configured at line 8 with `retry: 1` and `refetchOnWindowFocus: false`.

**`AppContent` (line 17)** — The actual layout:

```
┌──────────────────────────────────────────────────────┐
│  Header: "Tournament Trading Dashboard"               │
├──────────────────────────────────────────────────────┤
│                                                       │
│  <Dashboard />                                        │
│  (main content, switches between 5 views)             │
│                                                       │
├──────────────────────────────────┬────────────────────┤
│                                  │ <TeamPanel /> or   │
│                                  │ <GamePanel />      │
│                                  │ (right sidebar,    │
│                                  │  only when active) │
└──────────────────────────────────┴────────────────────┘
```

Key behaviors:
- **Sidebar management (lines 18-19):** Reads `selectedTeam` and `selectedGame` from the Zustand store. If either is set, a sidebar appears and the main content shifts left (`mr-96` — margin-right of 384px).
- **What-if initialization (lines 24-28):** On first load, fetches persisted what-if state from the backend via `initWhatIf()`. This ensures any overrides you set in a previous session are restored.
- **Mutual exclusivity (lines 46-47):** Only one sidebar at a time — `TeamPanel` or `GamePanel`, never both. Selecting a team clears the game selection and vice versa (enforced in the Zustand store, [`uiStore.ts:99-101`](../web/src/store/uiStore.ts)).

---

## The Three Pillars of State

The app uses two complementary state management systems, plus a type system:

### 1. Zustand Store — Client/UI State

[`web/src/store/uiStore.ts`](../web/src/store/uiStore.ts) — 427 lines.

Zustand is a lightweight state library. Think of it as a global mutable object with change notifications — components subscribe to specific slices and re-render when those slices change. It's conceptually similar to a Python dict that triggers callbacks on write.

**The store interface (lines 15-63) holds:**

| State slice | Type | Purpose |
|---|---|---|
| `selectedTeam` | `string \| null` | Which team's sidebar is open |
| `selectedGame` | `{team1, team2, bothConfirmedFromCompleted?}` | Which game's sidebar is open |
| `whatIf` | `WhatIfState` | All what-if overrides (permanent + scenario) |
| `scenarios` | `Scenario[]` | Named scenario definitions |
| `viewMode` | `'overview' \| 'bracket' \| 'whatif' \| 'completed' \| 'teamdetail'` | Which tab is active |
| `detailedViewTeam` | `string \| null` | Which team is shown in Team Detail view |
| `hypotheticalTrade` | `{team, direction, quantity, price}` | Trade being explored (not persisted) |
| `monteCarloStale` | `boolean` | Whether the distribution chart needs re-simulation |
| `bracketZoom` | `number` | Bracket view zoom level |
| `metaTeamModal` | `{nodeId} \| null` | Which bracket slot's team-picker is open |

**Accessing the store in components:**

```tsx
// Subscribe to one piece of state — component re-renders only when this value changes
const selectedTeam = useUIStore((state) => state.selectedTeam);

// Get an action (stable reference, doesn't cause re-renders)
const selectTeam = useUIStore((state) => state.selectTeam);
```

**What-if state management (lines 178-332)** is the most complex part. The pattern is:
1. **Optimistic update** — Immediately update local state so the UI feels instant
2. **Persist to backend** — Fire off an async API call
3. **Re-fetch on error** — If the API call fails, pull the authoritative state from the server (line 76-83, `refetchWhatIfState`)

This is a common frontend pattern for responsive UIs with server persistence.

### 2. React Query — Server/API State

React Query manages all data fetched from the backend. It handles:
- **Caching:** Once data is fetched, it's cached by a "query key" (like a cache key)
- **Staleness:** Data is considered fresh for `staleTime` milliseconds, then refetched on next access
- **Automatic refetch:** Some queries refetch on an interval (`refetchInterval`)
- **Invalidation:** When a mutation succeeds, related queries are invalidated to trigger re-fetch

You never see `fetch()` calls in components. Instead, components call custom hooks like `useTeams()`, which internally use React Query's `useQuery` to manage the fetch lifecycle.

### 3. TypeScript Types — The Schema

[`web/src/types/index.ts`](../web/src/types/index.ts) — 339 lines. All shared interfaces live here. These are compile-time only (erased in the build) but serve as documentation for the shape of data at every boundary.

Key types to understand:

| Type | Lines | Description |
|---|---|---|
| `TeamInfo` | 1-11 | A team: name, ratings, seed, position, delta |
| `WhatIfState` | 163-173 | Permanent + scenario overrides and active scenario |
| `WhatIfGameOutcome` | 116-120 | A single override: team1 beats team2 with probability P |
| `BracketGame` | 79-84 | A bracket slot: round, region, team→probability map |
| `BracketTreeNode` | 274-294 | A node in the bracket tree (parent/child IDs, teams, state) |
| `OrderbookLevel` | 222-226 | A single price level in the order book |
| `HypotheticalTrade` | 186-191 | A trade being explored (direction, quantity, price) |
| `PortfolioSummary` | 19-33 | Monte Carlo result: EV, histogram, percentiles |
| `ViewMode` | 183 | Union type of the 5 tab names |

---

## API Layer

[`web/src/api/`](../web/src/api/) — The HTTP client that talks to the Python backend.

### Base Client

[`web/src/api/client.ts`](../web/src/api/client.ts) — 67 lines.

Two exports:

1. **`encodeWhatIfParams(whatIf)` (line 10):** Serializes what-if state into URL query parameters. This is used by nearly every API call so the backend can compute results with the current overrides applied. For example, a teams request with what-if overrides becomes:
   ```
   /api/v1/tournament/teams?what_if_outcomes=[...]&what_if_adjustments={...}
   ```

2. **`api` object (line 50):** A thin wrapper around `fetch` with JSON serialization and error handling. Provides `api.get<T>`, `api.post<T>`, `api.put<T>`, `api.delete<T>`.

### Endpoint Modules

Each module exports an object with methods that call `api.get/post/put/delete`:

| Module | File | Endpoints |
|---|---|---|
| **Tournament** | [`api/tournament.ts`](../web/src/api/tournament.ts) | Teams list, single team, bracket, bracket tree, scores, completed games, scoring config |
| **Portfolio** | [`api/portfolio.ts`](../web/src/api/portfolio.ts) | Positions, expected value, Monte Carlo distribution, deltas, team impact, hypothetical value |
| **Analysis** | [`api/analysis.ts`](../web/src/api/analysis.ts) | Game impact, game importance, slot candidates, compute path, scenarios CRUD, what-if state persistence |
| **Market** | [`api/market.ts`](../web/src/api/market.ts) | Order book, make market, my markets |

**The analysis API ([`api/analysis.ts`](../web/src/api/analysis.ts))** is the most complex because it handles both read-only analysis endpoints and the full what-if state persistence lifecycle (get/set/remove/clear/promote for both game outcomes and rating adjustments, lines 41-97).

Note the `getWhatIfState` method (line 41): it translates `snake_case` backend field names to `camelCase` frontend field names. This is the only place where field name translation happens explicitly — elsewhere, the JSON comes through as-is.

---

## Custom Hooks (the glue)

[`web/src/hooks/`](../web/src/hooks/) — These connect the API layer to components via React Query. Each hook encapsulates:
- The query key (cache identifier)
- The API call
- Stale time and refresh behavior
- Dependencies on Zustand state (like `whatIf`)

### Tournament Hooks

[`web/src/hooks/useTournament.ts`](../web/src/hooks/useTournament.ts) — 135 lines.

| Hook | Line | Query key | Stale time | Notes |
|---|---|---|---|---|
| `useTeams()` | 24 | `['tournament', 'teams', whatIfKey]` | 5 min | Re-fetches when what-if changes |
| `useTeam(name)` | 33 | `['tournament', 'teams', name]` | 5 min | Single team |
| `useBracket()` | 42 | `['tournament', 'bracket', whatIfKey]` | 5 min | Re-fetches on what-if |
| `useBracketTree()` | 55 | `['tournament', 'bracket-tree', whatIfKey]` | 5 min | Tree structure |
| `useGameImportance()` | 64 | `['analysis', 'game-importance', whatIfKey]` | 1 min | Shorter stale time |
| `useGameImpact(t1, t2)` | 73 | `['analysis', 'game', t1, t2]` | 1 min | Enabled only when both teams set |
| `useSlotCandidates(r, p)` | 82 | `['analysis', 'slot-candidates', ...]` | 1 min | For bracket slot selection |
| `useCompletedGames()` | 92 | `['tournament', 'completed-games']` | 5 min | |
| `useAddCompletedGame()` | 100 | — (mutation) | — | Invalidates tournament + analysis + portfolio |
| `useRemoveCompletedGame()` | 114 | — (mutation) | — | Same broad invalidation |
| `useScoringConfig()` | 128 | `['tournament', 'scoring']` | Infinity | Never re-fetches |

**The `whatIfKey` helper (line 8):** Creates a stable string from the current what-if state. This is included in query keys so that React Query treats "base state" and "state with overrides" as different cache entries. When you add an override, the query key changes, React Query sees it as a new query, and fetches fresh data from the backend with the overrides applied.

**Mutations (lines 100-126):** `useAddCompletedGame` and `useRemoveCompletedGame` use `useMutation` for write operations. On success, they invalidate query caches with broad prefixes (`['tournament']`, `['analysis']`, `['portfolio']`) to force everything to re-fetch — because recording a game result changes nearly all computed values.

### Portfolio Hooks

[`web/src/hooks/usePortfolio.ts`](../web/src/hooks/usePortfolio.ts) — 70 lines.

| Hook | Line | Notes |
|---|---|---|
| `usePositions()` | 6 | Re-fetches every 60s |
| `usePortfolioValue()` | 15 | Reactive to what-if (cheap calculation) |
| `usePortfolioDistribution(n)` | 27 | **NOT** reactive to what-if (expensive Monte Carlo). User must click "Re-simulate" |
| `useDeltas(pointDelta)` | 39 | Portfolio sensitivity |
| `useTeamImpact(team)` | 47 | Enabled only when team is selected |
| `useHypotheticalPortfolio(changes)` | 56 | Reactive to both position changes and what-if |

The distinction between `usePortfolioValue` and `usePortfolioDistribution` at lines 15-37 is important: the EV calculation is cheap (probabilistic), so it updates instantly when what-if changes. The Monte Carlo distribution is expensive, so its query key deliberately excludes the what-if state — it only re-runs when the user clicks "Re-simulate". The `monteCarloStale` flag in Zustand tracks when the distribution needs updating.

### Market Hooks

[`web/src/hooks/useMarket.ts`](../web/src/hooks/useMarket.ts) — 35 lines.

| Hook | Line | Notes |
|---|---|---|
| `useOrderbook(team)` | 5 | Auto-refetch every 15s (live data) |
| `useMyMarkets()` | 15 | Auto-refetch every 30s |
| `useMakeMarket()` | 24 | Mutation; invalidates orderbook + my-markets on success |

---

## Component Tour

### Dashboard — The View Router

[`web/src/components/Dashboard/Dashboard.tsx`](../web/src/components/Dashboard/Dashboard.tsx) — 110 lines.

This is the main content area. It always renders `<PortfolioSummary />` at the top, then a row of tab buttons, then the active view:

| Tab | View Mode | Component(s) rendered |
|---|---|---|
| Teams | `overview` | `<TeamsTable />` + `<GameImportanceTable />` |
| Bracket | `bracket` | `<BracketView />` |
| What-If | `whatif` | `<WhatIfTool />` + instructions panel |
| Completed Games | `completed` | `<CompletedGamesView />` |
| Team Detail | `teamdetail` | `<TeamDetailView />` |

The view mode is stored in Zustand ([`uiStore.ts:95`](../web/src/store/uiStore.ts)), so it persists as you interact with sidebars.

### PortfolioSummary — The Always-Visible Header

[`web/src/components/Dashboard/PortfolioSummary.tsx`](../web/src/components/Dashboard/PortfolioSummary.tsx) — 384 lines.

Always visible at the top. Shows:
- **Team EV / Cash / Total EV** (line 252-267) — Live values that update reactively on what-if changes
- **Scenario controls** (line 269-302) — "Re-simulate" button (when stale), "Clear Temp" button, permanent override count badge, scenario selector
- **D3 histogram** (line 18-149, `DistributionChart` sub-component) — Monte Carlo distribution of portfolio values
- **Percentile summary** (lines 329-351) — p1, p25, p50, p75, p99
- **Simulation count selector** (lines 360-375) — 1K / 10K / 50K / 100K

The chart uses D3 for SVG rendering (not React's virtual DOM). This is a common pattern for data visualization — D3 manages the SVG elements imperatively inside a `useEffect`.

The collapsible behavior (line 153, `isCollapsed` state) lets users minimize the chart to save vertical space.

### TeamsTable — Sortable Team List

[`web/src/components/Dashboard/TeamsTable.tsx`](../web/src/components/Dashboard/TeamsTable.tsx) — 99 lines.

A filterable, sortable table of teams showing: name, position, EV (expected value), value (position x EV), and delta (portfolio sensitivity).

**Interactions:**
- **Single-click** a row → opens `TeamPanel` sidebar (line 71)
- **Double-click** a row → navigates to Team Detail view (line 72-75)

Uses the reusable `SortHeader` component and `useSortState`/`sortData` utilities from [`common/SortableTable.tsx`](../web/src/components/common/SortableTable.tsx).

### GameImportanceTable — Prioritized Game List

[`web/src/components/Dashboard/GameImportanceTable.tsx`](../web/src/components/Dashboard/GameImportanceTable.tsx) — 117 lines.

Shows upcoming games ranked by how much they affect your portfolio. Columns: matchup, round, win probability, portfolio impact if each team wins, raw importance, adjusted importance.

**Click** a row → opens `GamePanel` sidebar (line 86).

### BracketView — Tournament Bracket Visualization

[`web/src/components/Bracket/BracketView.tsx`](../web/src/components/Bracket/BracketView.tsx) — 1588 lines. This is by far the largest component.

Uses D3 to render an SVG bracket with:
- **6 sub-views:** overall (2x2 grid of regions), each individual region, and sweet 16
- **Color-coded game boxes:** Green/red intensity for portfolio delta, gray→blue gradient for importance
- **Interactive slots:** Click a game box to open the GamePanel sidebar, click a team name to select that team, double-click a team to go to Team Detail
- **Completed game handling:** Gray background for completed games, strikethrough for eliminated teams
- **What-if integration:** Bracket re-renders with new probabilities when overrides change

The bracket is rendered using D3's DOM manipulation (`d3.select().append()...`) inside `useEffect` hooks, not React JSX. This is the standard approach for complex SVG visualizations in React apps.

### TeamPanel — Team Sidebar

[`web/src/components/TeamPanel/TeamPanel.tsx`](../web/src/components/TeamPanel/TeamPanel.tsx) — 367 lines.

A fixed-position right sidebar that appears when a team is selected. Shows:
- Expected score, position, portfolio delta
- **What-if rating adjustment controls** (lines 146-254) — Quick buttons (+/-1, +/-5), custom input, current adjustment display with permanent/scenario badge, "Make Permanent" promote button
- **Delta breakdown table** (lines 257-324) — How adjusting this team's rating impacts each of your holdings
- Team ratings (offense/defense/tempo)
- Position value calculation

### GamePanel — Game Sidebar

[`web/src/components/GamePanel/GamePanel.tsx`](../web/src/components/GamePanel/GamePanel.tsx) — 276 lines.

Appears when a game is selected. Shows:
- Win probabilities for each team
- **"Record Result" buttons** (lines 126-151) — Only shown when `bothConfirmedFromCompleted` is true (both teams reached this matchup through already-recorded completed games). This prevents accidentally recording hypothetical matchups.
- Portfolio impact if each team wins, total swing
- Game importance scores
- **Impact breakdown table** (lines 199-267) — Which holdings are affected and by how much

### TeamDetailView — Full-Page Team Analysis

[`web/src/components/TeamDetail/TeamDetailView.tsx`](../web/src/components/TeamDetail/TeamDetailView.tsx) — 641 lines.

The most feature-rich view. Accessed via the "Team Detail" tab or by double-clicking a team anywhere.

**Layout:**
```
┌─────────────────────┬──────────────────────┐
│  Team Stats          │  Hypothetical Trade   │
│  (EV, position,     │  (buy/sell, qty,      │
│   bid/ask, delta,   │   price slider)       │
│   offense/def/tempo) │                      │
├─────────────────────┼──────────────────────┤
│  Order Book          │  Market Maker         │
│  (live bids/asks)   │  (place quotes)       │
├─────────────────────┴──────────────────────┤
│  Portfolio Impact                            │
│  (position change, EV change, cost, net)    │
├─────────────────────┬──────────────────────┤
│  Per-Team Delta Risk │  Delta Breakdown      │
│  (how trade changes │  (holding-level       │
│   exposure to all   │   impact of rating    │
│   teams)            │   adjustment)          │
└─────────────────────┴──────────────────────┘
```

**The hypothetical trade system (lines 88-139):**
Lets you explore "what if I buy/sell N shares at price P?" The trade is stored in Zustand's `hypotheticalTrade` state. When quantity > 0, it triggers:
- `useHypotheticalPortfolio` hook → API call with position changes → shows EV delta
- Delta risk table computation (lines 55-86, `useMemo`) → shows how the trade changes your sensitivity to every team

### OrderBook

[`web/src/components/TeamDetail/OrderBook.tsx`](../web/src/components/TeamDetail/OrderBook.tsx) — 137 lines.

Displays the CIX market order book for a team. Two side-by-side tables (bids and asks) with price, size, and entry name. Auto-refreshes every 15 seconds via `useOrderbook`. Shows mock badge when using simulated data.

### MarketMakerControls

[`web/src/components/TeamDetail/MarketMakerControls.tsx`](../web/src/components/TeamDetail/MarketMakerControls.tsx) — 261 lines.

A form for placing/updating market maker quotes. Features:
- **Linked controls (lines 76-106):** Midpoint + spread % sliders automatically compute bid/ask, and vice versa. The `handleMidpointChange`/`handleSpreadChange`/`handleBidChange`/`handleAskChange` callbacks keep all four values in sync.
- **Pre-populate from existing orders (lines 46-68):** If you already have a market for this team, the form loads your current prices.
- **Validation (line 119):** Bid must be < Ask, all values positive.
- **Submit (line 108):** Calls `useMakeMarket()` mutation → API → invalidates orderbook cache.

### Common Utilities

[`web/src/components/common/SortableTable.tsx`](../web/src/components/common/SortableTable.tsx) — 125 lines.

Reusable sorting infrastructure:
- **`SortMode`** — Three-way cycle: `abs-desc` → `desc` → `asc` (absolute value descending is default, useful for financial data where you care about magnitude regardless of sign)
- **`useSortState(defaultColumn)`** — Hook that manages sort column + mode with click-to-cycle behavior
- **`sortData(data, column, mode, getValue)`** — Generic sort function
- **`SortHeader`** — Clickable column header component with sort indicators (`↓|` for abs-desc, `↓` for desc, `↑` for asc)

---

## Data Flow Walkthrough

Here's how data flows through the system, using "user changes a what-if override" as an example:

1. **User clicks +1 on a team's rating** in `TeamPanel` (line 219)
2. Calls `handleQuickAdjust(1)` → `setRatingAdjustment(team, newValue)` from Zustand store
3. **Zustand store** ([`uiStore.ts:264-279`](../web/src/store/uiStore.ts)):
   - Immediately updates `whatIf.scenarioRatingAdjustments` (optimistic update)
   - Sets `monteCarloStale: true`
   - Fires `analysisApi.setWhatIfRatingAdjustment()` async (line 276)
4. **React re-renders:** Any component subscribed to `whatIf` state re-renders
5. **React Query cache invalidation:** Hooks like `useTeams()` include `whatIfKey(whatIf)` in their query key ([`useTournament.ts:27`](../web/src/hooks/useTournament.ts)). Since the what-if state changed, the key changed, so React Query treats it as a new query and fetches fresh data:
   ```
   GET /api/v1/tournament/teams?what_if_adjustments={"TeamName":1.0}
   ```
6. **Backend** recalculates with the adjustment applied, returns new team data
7. **Components re-render** with new expected scores, deltas, etc.
8. **Distribution stays stale:** The Monte Carlo histogram doesn't re-fetch (its key doesn't include what-if). The "Re-simulate" button appears amber.

---

## Styling

The app uses **Tailwind CSS** — a utility-first CSS framework where you style elements by composing class names directly in the JSX. There is no separate `.css` file per component.

[`web/src/index.css`](../web/src/index.css) — 14 lines. Just imports Tailwind's base, components, and utilities layers.

**Reading Tailwind classes (a quick decoder ring):**

| Class | Meaning |
|---|---|
| `bg-white`, `bg-gray-50` | Background color |
| `text-gray-900`, `text-sm`, `text-2xl` | Text color, size |
| `font-semibold`, `font-bold` | Font weight |
| `p-6`, `px-4`, `py-2` | Padding (all, horizontal, vertical) |
| `mb-4`, `mt-2`, `mr-96` | Margin (bottom, top, right) |
| `rounded-lg` | Border radius |
| `shadow`, `shadow-xl` | Box shadow |
| `flex`, `gap-2`, `items-center` | Flexbox layout |
| `grid`, `grid-cols-2` | CSS Grid layout |
| `hover:bg-gray-50` | Style on hover |
| `animate-pulse` | Loading skeleton animation |
| `fixed inset-y-0 right-0 w-96` | Fixed sidebar, full height, right-aligned, 384px wide |
| `cursor-pointer` | Clickable appearance |
| `transition-all duration-300` | Smooth animation for layout shifts |

**Color conventions in this app:**
- **Green** (`text-green-600`) = positive values (gains, long positions)
- **Red** (`text-red-600`) = negative values (losses, short positions)
- **Blue** (`text-blue-600`) = neutral highlights (EV, importance scores)
- **Purple** (`bg-purple-50`) = permanent overrides
- **Amber/Yellow** (`bg-amber-100`) = warnings, stale data, mock data

---

## Key Patterns & Conventions

### Pattern: Selector functions for Zustand

Components always subscribe to individual slices via selector functions:
```tsx
const selectedTeam = useUIStore((state) => state.selectedTeam);
```
Not `const { selectedTeam, selectTeam } = useUIStore()`. The selector pattern prevents unnecessary re-renders — the component only re-renders when its specific slice changes.

### Pattern: Conditional rendering

React uses `{condition && <Component />}` for conditional rendering. For example in [`App.tsx:46-47`](../web/src/App.tsx):
```tsx
{selectedTeam && <TeamPanel teamName={selectedTeam} />}
```
This means: "if `selectedTeam` is truthy, render `TeamPanel`".

### Pattern: Loading skeletons

While data loads, components show animated gray rectangles:
```tsx
if (isLoading) {
  return <div className="animate-pulse"><div className="h-8 bg-gray-200 rounded" /></div>;
}
```

### Pattern: Enabled queries

Queries that depend on a selection use the `enabled` option:
```tsx
useQuery({
  queryKey: ['market', 'orderbook', team],
  queryFn: () => marketApi.getOrderbook(team!),
  enabled: !!team,  // Only fetch when team is selected
});
```
The `!` after `team` is TypeScript's non-null assertion — safe here because `enabled` prevents the call when `team` is null.

### Pattern: Mutations with cache invalidation

Write operations follow this pattern (e.g., [`useTournament.ts:100-112`](../web/src/hooks/useTournament.ts)):
```tsx
useMutation({
  mutationFn: (data) => api.post('/endpoint', data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['tournament'] });
    // Invalidating with a prefix clears ALL queries starting with that key
  },
});
```

### Convention: Team name ordering

What-if outcomes are stored with teams in lexicographic order ([`uiStore.ts:180`](../web/src/store/uiStore.ts)):
```tsx
const [t1, t2, prob] = team1 < team2
  ? [team1, team2, probability]
  : [team2, team1, 1.0 - probability];
```
This ensures the same matchup is always represented the same way regardless of which team was selected first.

### Convention: Component file organization

Each component directory contains one main component per file, exported as a named export:
```tsx
export function TeamsTable() { ... }
```
Not default exports. This makes imports explicit and refactoring easier.
