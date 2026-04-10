# Sub-project 3: Gamified Dashboard Design Spec

> **For agentic workers:** This spec is the design contract for the gamified dashboard. Use it as input to `superpowers:writing-plans` to generate the implementation plan.

**Goal:** 为 14 名辉瑞 HBU 学员构建一个游戏化五维评分看板，以暗色街机风格呈现 AQ 排行、个人雷达图、段位晋升轨迹，通过飞书 H5 网页应用嵌入飞书工作台实现零登录访问。

**Architecture:** React 19 SPA + Vite，部署为 `apps/dashboard/` 新目录（与待删除的 `web/src/` 完全隔离），构建输出到 `dist-dashboard/`，由 Fastify 静态托管。数据来源为 Sub1 的 `/api/v2/board/*` REST 端点。

**Tech Stack:** TypeScript 5.9, React 19, Vite 7, React Router 7, `reend-components` (MIT, 暗色 HUD 组件库含 RadarChart/HoloCard/TacticalPanel/GlitchText), `questro` (MIT, 游戏化逻辑引擎含 Levels/XP/Badges/Leaderboard), recharts (补充图表), Tailwind CSS, Radix UI (via reend-components), Press Start 2P + JetBrains Mono fonts.

**开源基础:** 优先使用 `reend-components` (github.com/VBeatDead/ReEnd-Components) 的暗色 HUD 视觉体系 + `questro` (github.com/marquespq/questro) 的游戏化引擎，在其上构建薄应用层连接 Sub1 API。避免 fork 单一项目（搜索 5 个候选均有域耦合问题）。

**Visual Direction:** V3 暗色街机 / 复古游戏风格 — CRT 扫描线纹理、霓虹维度色、像素风段位徽章、8-bit HP 血条进度条。

---

## §1 Data Sources

### 1.1 Consumed API Endpoints

| Endpoint | Method | Returns | Dashboard Usage |
|----------|--------|---------|-----------------|
| `/api/v2/board/ranking?campId=` | GET | `{ ok, campId, rows }` — 14 名学员排行 | 排行榜页 |
| `/api/v2/board/member/:id` | GET | `{ ok, detail }` — 单学员五维+历史 | 成员详情页 |
| `/api/v2/llm/worker/status` | GET | LLM worker 状态 | 系统状态指示器 |

### 1.2 Ranking Row Shape (from Sub1 G8)

```typescript
interface RankingRow {
  memberId: string;
  displayName: string;
  cumulativeAq: number;
  latestWindowAq: number;
  currentLevel: number; // 1-5
  dimensions: { K: number; H: number; C: number; S: number; G: number };
  rank: number;
}
```

### 1.3 Member Detail Shape (from Sub1 G8)

```typescript
interface MemberBoardDetail {
  memberId: string;
  displayName: string;
  currentLevel: number;
  cumulativeAq: number;
  dimensions: { K: number; H: number; C: number; S: number; G: number };
  dimensionCaps: { K: number; H: number; C: number; S: number; G: number };
  windowSnapshots: Array<{
    windowId: string;
    windowCode: string;
    aq: number;
    dims: { K: number; H: number; C: number; S: number; G: number };
    settledAt: string;
  }>;
  promotions: Array<{
    windowCode: string;
    oldLevel: number;
    newLevel: number;
    direction: "promoted" | "demoted" | "held";
    reason: string; // JSON from promotion judge
  }>;
  levelHistory: Array<{
    level: number;
    achievedAt: string;
    windowCode: string;
  }>;
}
```

### 1.4 Data Volume

- 14 students × 12 periods × ~6 windows max × 5 dimensions
- Total payload: < 5 MB full ranking + all detail pages
- Client-side filtering sufficient, no pagination needed

---

## §2 Visual Design System

### 2.1 Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-base` | `#0a0a1a` | Page background |
| `--bg-surface` | `#12122a` | Card surfaces |
| `--bg-elevated` | `#1a1a3a` | Hover/active states |
| `--text-primary` | `#e0e0ff` | Primary text |
| `--text-secondary` | `#8888aa` | Secondary text |
| `--border-glow` | `#2a2a5a` | Card borders |
| `--dim-k` | `#00ff88` | Knowledge (neon green) |
| `--dim-h` | `#ff6b35` | Hands-on (neon orange) |
| `--dim-c` | `#a855f7` | Creativity (neon purple) |
| `--dim-s` | `#06b6d4` | Social (neon cyan) |
| `--dim-g` | `#fbbf24` | Growth (neon gold) |
| `--level-1` | `#6b7280` | AI 潜力股 (grey) |
| `--level-2` | `#22c55e` | AI 行动派 (green) |
| `--level-3` | `#3b82f6` | AI 探索者 (blue) |
| `--level-4` | `#a855f7` | AI 创造者 (purple) |
| `--level-5` | `#f59e0b` | AI 奇点玩家 (gold) |
| `--accent` | `#ff2d78` | CTA / highlights (neon pink) |

### 2.2 Typography

| Token | Font | Weight | Size |
|-------|------|--------|------|
| `--font-display` | Press Start 2P | 400 | clamp(1rem, 0.8rem + 1vw, 1.5rem) |
| `--font-mono` | JetBrains Mono | 400/700 | clamp(0.75rem, 0.7rem + 0.5vw, 1rem) |
| `--font-body` | JetBrains Mono | 400 | clamp(0.875rem, 0.8rem + 0.3vw, 1rem) |

### 2.3 Effects

- **CRT Scanline:** CSS `::after` pseudo-element with repeating-linear-gradient, 2px lines, opacity 0.03
- **Neon Glow:** `box-shadow: 0 0 8px var(--dim-*), 0 0 20px var(--dim-*)`
- **Card Hover:** `transform: translateY(-2px)` + border glow intensify
- **prefers-reduced-motion:** Disable all transitions, remove scanline overlay

---

## §3 Screens & Component Hierarchy

### 3.1 Screen Inventory

| # | Route | Screen | Type |
|---|-------|--------|------|
| S1 | `/` | Leaderboard | Primary |
| S2 | `/m/:memberId` | Member Detail | Primary |
| S3 | `/m/:memberId/promotion/:windowCode` | Promotion Replay | Secondary |
| S4 | `/status` | System Status | Utility |

### 3.2 Component Tree

```
App (React Router + dark theme provider)
├── Layout (CRT scanline overlay + nav)
│   ├── NavBar (logo + camp name + system status dot)
│   └── <Outlet />
│
├── LeaderboardPage  /
│   ├── CampHeader (camp name + current period + window)
│   ├── TierSection × 5 (per level group)
│   │   ├── TierBanner (level name + neon badge)
│   │   └── LeaderboardRow × N
│   │       ├── RankBadge (#1, #2, #3 special)
│   │       ├── MemberName + LevelPill
│   │       ├── AqScore (large mono number)
│   │       └── DimensionMiniBar × 5 (K/H/C/S/G)
│   └── WindowSelector (W1/W2/.../current tabs)
│
├── MemberDetailPage  /m/:memberId
│   ├── MemberHero (name + level badge + AQ score)
│   ├── AqRadarChart (recharts RadarChart, 5 axes, neon fill)
│   ├── DimensionBreakdown (5 rows with HP-bar progress)
│   │   └── DimensionRow (label + bar + current/cap)
│   ├── WindowTimeline (horizontal W1→W6 with AQ dots)
│   │   └── TimelineNode × N (clickable, shows window AQ)
│   ├── DimensionSparklines (5 mini LineCharts for K/H/C/S/G over windows)
│   └── PromotionHistory (list of level changes with reasons)
│       └── PromotionCard (old→new level, direction arrow, reason excerpt)
│
├── PromotionReplayPage  /m/:memberId/promotion/:windowCode
│   ├── PromotionHero (level change badge with animation)
│   ├── ConditionChecklist (rendered from judge reason JSON)
│   └── BackLink
│
└── StatusPage  /status
    ├── LlmWorkerStatus
    └── SystemHealth
```

### 3.3 Responsive Breakpoints

| Breakpoint | Width | Layout |
|-----------|-------|--------|
| Mobile | < 640px | Single column, stacked cards |
| Tablet | 640-1024px | 2-column grid |
| Desktop | > 1024px | Full layout with sidebar |

---

## §4 Data Fetching Strategy

### 4.1 Pattern

- **Client-side fetch** via `fetch()` to `/api/v2/board/*`
- **SWR-like pattern:** Cache in React state, revalidate on window focus
- **Full-page data:** Ranking endpoint returns all 14 students; no pagination needed
- **Detail on demand:** Member detail fetched when navigating to `/m/:id`

### 4.2 Custom Hooks

```typescript
// useRanking(campId) → { data, loading, error, refetch }
// useMemberDetail(memberId) → { data, loading, error }
```

### 4.3 Error States

- Network error → retry button + cached data if available
- 404 member → "学员未找到" page
- 500 → generic error card with retry

---

## §5 Build & Deploy

### 5.1 Directory Structure

```
apps/dashboard/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json (workspace reference)
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes/
│   │   ├── LeaderboardPage.tsx
│   │   ├── MemberDetailPage.tsx
│   │   ├── PromotionReplayPage.tsx
│   │   └── StatusPage.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Layout.tsx
│   │   │   ├── NavBar.tsx
│   │   │   └── CrtOverlay.tsx
│   │   ├── leaderboard/
│   │   │   ├── TierSection.tsx
│   │   │   ├── LeaderboardRow.tsx
│   │   │   ├── RankBadge.tsx
│   │   │   └── WindowSelector.tsx
│   │   ├── member/
│   │   │   ├── MemberHero.tsx
│   │   │   ├── AqRadarChart.tsx
│   │   │   ├── DimensionBreakdown.tsx
│   │   │   ├── WindowTimeline.tsx
│   │   │   ├── DimensionSparklines.tsx
│   │   │   └── PromotionHistory.tsx
│   │   └── ui/
│   │       ├── LevelPill.tsx
│   │       ├── DimensionMiniBar.tsx
│   │       ├── HpBar.tsx
│   │       └── NeonCard.tsx
│   ├── hooks/
│   │   ├── useRanking.ts
│   │   └── useMemberDetail.ts
│   ├── lib/
│   │   ├── api.ts
│   │   ├── colors.ts
│   │   └── levels.ts
│   └── styles/
│       ├── tokens.css
│       ├── global.css
│       └── crt.css
└── tests/
    ├── components/
    └── hooks/
```

### 5.2 Build Output

- `dist-dashboard/` — Vite build output
- Fastify serves via `@fastify/static` on `/dashboard/*`
- Bundle budget: < 200KB gzipped (React + recharts + app code)

### 5.3 Fastify Integration

Add to `src/app.ts`:
```typescript
import { join } from "node:path";
import fastifyStatic from "@fastify/static";

// Dashboard SPA
await app.register(fastifyStatic, {
  root: join(__dirname, "../dist-dashboard"),
  prefix: "/dashboard/",
  decorateReply: false
});
```

---

## §6 Feishu H5 Integration

### 6.1 Entry Point

- 飞书工作台 → 自定义应用 → 网页应用 → 主页 URL: `http://<SWAS_IP>:3000/dashboard/`
- JSSDK: `tt.requestAccess` → 获取 user code → exchange for open_id → highlight current user row

### 6.2 Identity Flow

```
[Feishu 工作台] → [Dashboard SPA]
                     │ tt.requestAccess()
                     ▼
              [Feishu OAuth server]
                     │ user code
                     ▼
              [GET /api/v2/feishu/user-info?code=xxx]
                     │ returns { openId, memberId }
                     ▼
              [Dashboard highlights current user]
```

### 6.3 Fallback (no JSSDK)

- If opened outside Feishu (direct browser), show full leaderboard without current-user highlighting
- No login required — data is public within the camp

---

## §7 Testing Strategy

### 7.1 Unit Tests

- Custom hooks: `useRanking`, `useMemberDetail` with MSW mocks
- Utility functions: `getLevelConfig`, `getDimensionColor`, `formatAq`
- Component rendering: key components render without errors

### 7.2 Visual Regression

- Playwright screenshots at 375px, 768px, 1440px
- Light/dark theme (only dark in MVP)

### 7.3 E2E

- Navigate to leaderboard → see 14 rows
- Click a row → navigate to member detail
- Radar chart renders with 5 axes
- Back button returns to leaderboard

---

## §8 Phased Delivery

| Phase | Scope | Screens | Est. Tasks |
|-------|-------|---------|------------|
| **P1 — Scaffold** | Vite + React + Router + CSS tokens + CRT overlay | Layout only | 3 |
| **P2 — Leaderboard** | Ranking fetch + TierSection + LeaderboardRow + DimensionMiniBar | S1 | 4 |
| **P3 — Member Detail** | Member fetch + RadarChart + DimensionBreakdown + Timeline | S2 | 5 |
| **P4 — Promotion** | Promotion replay + judge reason renderer | S3 | 2 |
| **P5 — Polish** | Animations + responsive + a11y + bundle optimization | All | 3 |
| **P6 — Feishu H5** | JSSDK integration + user highlighting + Fastify static | All | 2 |

**Total: ~19 tasks**

---

## §9 Success Criteria

- [ ] Leaderboard renders 14 students with correct AQ scores and levels
- [ ] Radar chart displays 5 dimensions accurately per member
- [ ] Dimension progress bars show current/cap ratios
- [ ] Window timeline allows navigating between windows
- [ ] Promotion history shows level transitions with reasons
- [ ] CRT scanline effect visible on all surfaces
- [ ] Neon dimension colors are consistent across all components
- [ ] Bundle size < 200KB gzipped
- [ ] Responsive at 375px, 768px, 1440px
- [ ] prefers-reduced-motion disables all animations
- [ ] Works in Feishu H5 WebView
- [ ] All tests pass (unit + component)

---

## §10 Cross-Subproject Dependencies

| Dependency | Source | Status |
|-----------|--------|--------|
| `/api/v2/board/ranking` | Sub1 G8 | ✅ Implemented |
| `/api/v2/board/member/:id` | Sub1 G8 | ✅ Implemented |
| `fetchRankingByCamp()` shape | Sub1 Repository | ✅ Implemented |
| `fetchMemberBoardDetail()` shape | Sub1 Repository | ✅ Implemented |
| Feishu 网页应用注册 | Manual | ⏳ Pending (不阻塞 P1-P5) |
| SWAS HTTPS cert | Ops | ⏳ Pending (不阻塞 P1-P5) |

---

## §11 Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Feishu proxy 不接受自签证书 | HIGH | P6 前做 30 分钟 spike 验证 |
| recharts RadarChart 在 Feishu WebView 中渲染异常 | MEDIUM | P3 完成后立即在真机验证 |
| Press Start 2P 中文回退不美观 | LOW | 中文标题改用 JetBrains Mono Bold |
| `fetchMemberBoardDetail` 返回形状与预期不同 | MEDIUM | P3 开始前确认 Sub1 Repository 实现 |
