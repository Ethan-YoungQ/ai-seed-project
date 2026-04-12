# Sub-project 3: Gamified Dashboard & In-group Access — Pre-brainstorm research

**Status:** Research draft
**Date:** 2026-04-10
**Author:** sub3-research subagent
**Scope:** Options + tradeoffs for the interactive brainstorming session. NOT a decision document.

---

## 1. Executive summary

### 1.1 What sub-project 3 must deliver

Sub-project 3 is the player-facing surface of the AI training camp leveling system. Its three non-negotiable jobs are:

1. **A gamified leaderboard web dashboard** that reflects AQ five-dimension scores, 5 rank segments (Lv.1 AI 潜力股 → Lv.5 AI 奇点玩家), per-window progression, and promotion history, for 14 Pfizer HBU students over 12 periods. Data source: the `/api/v2/board/*` routes defined in sub-project 1 (see sources §11).
2. **In-group access** from inside the Feishu group chat — students must be able to go from a card in the group to their member detail page without leaving Feishu, without remembering URLs, and without clicking "trust this untrusted certificate."
3. **Anti-template visual direction** — not a shadcn card grid, not a default Base multi-dimensional table. Must feel game-like and specific to the training camp product. The user explicitly rejected Feishu Base dashboards because they look generic.

### 1.2 What sub-project 3 must NOT do

- It does not define the card protocol (that's sub-project 2).
- It does not define the scoring data model or aggregation (that's sub-project 1, already designed).
- It does not pick an LLM provider (that's sub-project 4).
- It does not modify sub-project 1's `/api/v2/board/*` contract; it only consumes it.

### 1.3 Key constraints discovered during research

| Constraint | Source |
|---|---|
| No ICP-registered domain | Aliyun capability baseline §4.2 |
| Cannot wait 15-20 days for ICP filing | Aliyun capability baseline §4.2 |
| Aliyun SWAS (cn-hangzhou) cannot serve unfiled HTTP/HTTPS to the public Internet | Aliyun capability baseline §4.1 |
| 0 domains, 0 SSL certs in the account | Aliyun capability baseline §2 |
| Feishu 工作台 / H5 mode requires a configured "redirect URL allowlist" in Security Settings | Feishu open platform docs (see §11) |
| Feishu H5 web app does support Android, iOS, Desktop, PC simultaneously | Feishu open platform docs §11 |
| `tt.requestAuthCode` is deprecated; `tt.requestAccess` is current | Feishu open platform docs §11 |
| Students use personal laptops/phones via public Internet, not Pfizer intranet | Aliyun baseline §4.2 |
| Existing frontend is React 19 + Vite + TypeScript, spa shell in `web/src/App.tsx` | `D:/Vibe Coding Project/AI Seed Project/web/src/App.tsx` |
| Existing frontend is slated for deletion in sub-project 1 Phase I Task I1 | sub1 plan lines 9602–9622, `2026-04-10-scoring-v2-core-domain.md` |
| The only hosting hardware currently owned is SWAS `0cf24a62cd3a463baf31c196913dc3cd` 2C2G | Aliyun baseline §3 |
| Total data scope: 14 students × 12 periods × 5 dimensions. Full historical joined payload < 5MB | sub1 spec §2.4 |

### 1.4 Brainstorming surface

The document enumerates meaningful, distinct options across:

- Hosting / topology: **5 options**
- Frontend stack: **4 options**
- Visual directions: **6 options**
- Screens: **7 screens**
- AQ 5-dim viz: **5 approaches**
- In-group access: **4 mechanisms**
- Auth / identity: **3 models**
- Open questions: **9 decision-forcing questions**

---

## 2. Hosting architecture options

Each option is evaluated against the hard constraints in §1.3. "ICP?" column is the killer — anything requiring an ICP-filed domain is fundamentally blocked.

### 2.1 Option H1 — Feishu H5 web app, SWAS hidden, Feishu-proxied URL

```
[Student Feishu app] ─┐
                      ▼
         [Feishu 工作台 / card button]
                      │
                      ▼
         [Feishu open-platform proxy]
                      │
                      ▼
         [Our SWAS public IP 114.215.170.79:443]
                      │
                      ▼
         [Fastify + static web assets]
```

- **DNS:** None. Feishu 工作台 loads the page via the "主页 URL" we register in the app console. That URL can be the SWAS public IP with HTTPS. Feishu is on the allowlist of outbound consumers of our backend; it does not require an ICP-filed domain to be reachable by *Feishu's* servers.
- **HTTPS:** Self-signed cert on SWAS 443 — **but** cert must be valid to the Feishu proxy, which means it either needs to be a real CA cert (Let's Encrypt needs a DNS name we do not have) or we need to tunnel through another layer that has a cert. This is the **unresolved gap** in this option. `[unknown: need to verify whether Feishu proxy tolerates self-signed backends or whether it requires a CA-signed cert]`.
- **Feishu app config:** Enable "网页应用" capability, fill the main-page URL, add to security settings allowlist, publish version, students see "评分看板" icon in 工作台.
- **Cost:** 0 extra RMB. Uses existing SWAS.
- **Latency budget:** SWAS → Feishu proxy → client. Typical ~200-400ms TTFB inside China network; plausible for gamified dashboard since data is <5MB.
- **Pros:**
  1. Zero domain purchase, zero ICP filing, zero new DNS.
  2. Strongest recommendation in Aliyun capability baseline §4.3 path 1.
  3. JSSDK gives automatic user identity via `tt.requestAccess` / `tt.getUserInfo`, so no login form for students.
- **Cons:**
  1. Cert story is unproven — if Feishu proxy does NOT accept self-signed backends, this is not actually free. `[unknown]`
  2. Requires a working Feishu open platform "custom app" with "网页应用" capability enabled. Sub-project 2 is also needed to register the app; dependency coupling.
  3. Students must open Feishu app on a supported client (Feishu mobile V3.44+ or PC); not browsable standalone.

### 2.2 Option H2 — Cloudflare Tunnel, quick tunnel (`*.trycloudflare.com`)

```
[Any browser] ──▶ [*.trycloudflare.com] ──▶ [Cloudflare edge] ──▶ [cloudflared on SWAS] ──▶ [Fastify]
```

- **DNS:** Cloudflare assigns a random `*.trycloudflare.com` subdomain on every `cloudflared` start. Not stable across restarts (Cloudflare docs explicitly state quick tunnels are for dev only — see §11).
- **HTTPS:** Cloudflare's edge cert, free and valid.
- **Feishu app config:** Must re-register the URL in the Feishu app console every time SWAS restarts cloudflared. Operationally painful.
- **Cost:** 0 RMB.
- **Latency:** CN user → CF edge (typically Hong Kong / Singapore PoP) → back through to SWAS via tunnel. Can be 400-800ms TTFB from mainland. CN access to Cloudflare fluctuates.
- **Pros:**
  1. Free TLS, free subdomain, no SWAS public port exposure.
  2. Works from any browser, not just inside Feishu.
- **Cons:**
  1. Subdomain churns on every restart — incompatible with Feishu allowlist-per-app.
  2. Quick tunnels have 200-concurrent-request cap and no SSE support (§11). 14 students shouldn't hit 200 concurrent, but we lose SSE as an option.
  3. CN-to-Cloudflare reachability is unreliable.

### 2.3 Option H3 — Cloudflare Tunnel, **named** tunnel on an existing Cloudflare-hosted domain

```
[Any browser] ──▶ [board.somedomain.tld] ──▶ [Cloudflare edge] ──▶ [cloudflared] ──▶ [SWAS Fastify]
```

- **DNS:** Requires the user or operator to already own *a domain* on Cloudflare DNS. The baseline §2 says 0 domains in the Aliyun account — but the user could in principle have an unrelated `*.tld` registered outside Aliyun. `[unknown: need to verify whether operator owns any non-Aliyun domain]`.
- **HTTPS:** Cloudflare managed, stable.
- **Feishu app config:** Register `board.somedomain.tld` once, done.
- **Cost:** 0 RMB beyond any existing domain; otherwise ~$10/year domain registration.
- **Latency:** Similar to H2 but stable.
- **Pros:**
  1. Stable hostname.
  2. Proper cert, proper URL.
  3. Works inside Feishu and outside.
  4. No ICP needed because the serving origin is Cloudflare, not Aliyun.
- **Cons:**
  1. Only available if the operator has an external domain. User has explicitly rejected new domain purchases.
  2. CN access to Cloudflare still variable.
  3. A domain still technically exists — the spirit of "no purchasing" needs user confirmation for this.

### 2.4 Option H4 — Feishu Base dashboard (explicitly rejected by user)

- **Listed for completeness only.** The user rejected this because "default Base tables look generic and don't convey game feel." Included here so brainstorming can decisively re-reject without re-litigating.

### 2.5 Option H5 — Bundled-and-delivered via Feishu card preview (no dashboard at all)

```
[Feishu group chat] ──▶ [card action] ──▶ [our bot renders a PNG chart] ──▶ [reply as image card]
```

- **Topology:** No hosted web app. The backend renders charts server-side (e.g. `chart.js-node-canvas` or `satori`) and posts them as image attachments to the group or to a DM.
- **DNS / HTTPS:** None.
- **Feishu app config:** None beyond existing bot.
- **Pros:**
  1. No hosting problem at all.
  2. Students literally never leave the group chat.
- **Cons:**
  1. Zero interactivity — no hover, no drilldown, no detail page.
  2. Feels less game-like per image than a real dashboard.
  3. All "screens" become static PNGs. Promotion animation becomes a GIF.
  4. Hard to show a per-member page without 14 separate card messages per window.

### 2.6 Hosting comparison matrix

| # | Option | ICP? | Cert? | Stable URL? | Works outside Feishu? | Cost | Gap |
|---|---|---|---|---|---|---|---|
| H1 | Feishu 网页应用 + SWAS backend | No | `[unknown]` | Yes (via app registration) | No (Feishu-only) | 0 | Feishu-proxy-cert unverified |
| H2 | Quick Cloudflare Tunnel | No | Yes | **No** (churns) | Yes | 0 | Unstable domain |
| H3 | Named Cloudflare Tunnel | No | Yes | Yes | Yes | 0-$10/yr | Requires existing domain |
| H4 | Feishu Base dashboard | No | Yes | Yes | No | 0 | **Rejected by user** |
| H5 | No dashboard, card-only | No | N/A | N/A | No | 0 | Zero interactivity |

---

## 3. Frontend stack options

All four options assume TypeScript and consume `/api/v2/board/ranking` and `/api/v2/board/member/:id` from sub-project 1 (sources §11). All four eventually land on the same SWAS. The existing stack is React 19 + Vite — see `web/src/App.tsx` and `web/vite.config.ts`.

### 3.1 Option F1 — React 19 SPA + Vite (current baseline)

- **Build output:** Single `index.html` + hashed JS/CSS bundles. Ships React runtime.
- **Bundle target:** 150-300 KB gzipped for the whole dashboard including Recharts/visx, lucide icons, and our UI code. Within the "app page" budget in `rules/web/performance.md`.
- **SSR:** None by default. All rendering happens in the browser.
- **Animation:** GSAP (import on demand), CSS transitions, Framer Motion (moderate payload).
- **Data fetching:** `fetch` to `/api/v2/board/*`. TanStack Query optional.
- **Mobile WebView fit:** Good. React 19 works in iOS ≥ 13, Android WebView ≥ Chrome 73. Feishu H5 baseline clients (V3.44+) are all recent.
- **Pros:**
  1. Already installed. `package.json` has `react ^19.2.0`, `@vitejs/plugin-react ^5.0.4`, `vite ^7.1.10`.
  2. Existing team familiarity.
  3. Fastify static-serves `dist-web/` directly (pattern already used).
- **Cons:**
  1. First paint blocked on JS parse; TTFP on mobile 3G around 1-2s.
  2. The existing `web/src/` is slated for deletion in sub1 Phase I Task I1. If we reuse the folder, we're rewriting on top of a soon-deleted surface. If we use a new folder, we're starting fresh.

### 3.2 Option F2 — Astro islands (+ React components)

- **Build output:** Per-route HTML shells, plus small React "islands" hydrated only where interactive.
- **Bundle target:** 30-80 KB for a page with one radar chart island. ~70% smaller than SPA per Astro/Next comparisons (§11).
- **SSR:** Build-time by default; can do on-demand SSR for fresh data.
- **Animation:** View Transitions API + Framer Motion on islands.
- **Data fetching:** Astro endpoints, or direct fetch at build + client revalidation.
- **Mobile WebView fit:** Excellent. Fastest TTFP of the four options.
- **Pros:**
  1. Dramatically smaller bundles, which matters on mobile-first.
  2. Built-in content-first mental model fits a dashboard that's 80% read-only.
  3. Allows dropping React where we don't need it (e.g. static promotion history table).
- **Cons:**
  1. New dev dependency, new build tool, different mental model.
  2. Our existing `/api/v2/board/*` payloads are fresh-per-request; pure static SSG gives stale data. We'd either want on-demand SSR (tiny Node runtime) or pure client fetch in islands.
  3. Astro "islands everywhere" loses some benefit when every page has interactive charts.

### 3.3 Option F3 — Fastify server-rendered views + sprinkled JS

- **Build output:** Fastify routes return HTML via a template engine (Handlebars, ejs, Eta) or `satori`. Small islands loaded as ES modules.
- **Bundle target:** <30 KB JS for the whole dashboard, mostly chart libraries.
- **SSR:** Yes, inline. No build step for the server.
- **Animation:** CSS + micro-JS. No React runtime at all.
- **Data fetching:** Direct repo calls on the same Fastify process.
- **Mobile WebView fit:** Best possible TTFP since there is literally nothing to hydrate.
- **Pros:**
  1. Lowest overall complexity. No frontend build pipeline.
  2. Reuses the Fastify instance already in `src/app.ts`.
  3. Very small mental-model surface: add a new view = add a new route.
  4. Closest to a "single deploy unit."
- **Cons:**
  1. Limited interactivity. Client-side state management is by hand.
  2. No React component reuse. Rewriting existing `web/src/components/*.tsx` as templates is work.
  3. Less idiomatic for a gamified dashboard with charts and motion.

### 3.4 Option F4 — Next.js app router (SSR)

- **Build output:** Full Next.js runtime, server components, client components, JS budget around 80-150 KB for a page with one radar chart.
- **SSR:** Best-in-class, streaming, RSC.
- **Animation:** Framer Motion + anything.
- **Mobile WebView fit:** OK. Next.js 15/16 is heavier than Astro but still under our "app page" budget.
- **Pros:**
  1. Familiar to anyone who has shipped React in production.
  2. First-class server components reduce client bundle.
  3. Large ecosystem for design / charts / auth.
- **Cons:**
  1. Heavy for a 14-user internal app. Overshoots in nearly every dimension.
  2. Adds a separate Node runtime alongside Fastify unless we use Next.js standalone on the same box.
  3. Imposes Next.js file-system routing conventions on a team already using Fastify routes.
  4. Middleware conflict potential with Fastify routes on the same port.

### 3.5 Frontend stack comparison matrix

| # | Option | Bundle (gz) | SSR | Anim | Mobile TTFP | New deps | Fit 14 users |
|---|---|---|---|---|---|---|---|
| F1 | React SPA + Vite (current) | 150-300 KB | No | GSAP/Framer | OK | None | Good |
| F2 | Astro + React islands | 30-80 KB | Build-time + SSR | Framer in islands | Best | Add Astro | Good |
| F3 | Fastify views + micro-JS | <30 KB | Inline | CSS/micro-JS | Best | Add template engine | Excellent |
| F4 | Next.js app router | 80-150 KB | RSC / stream | Framer | OK | Add Next.js | Overkill |

---

## 4. Visual direction options

Constraint recap: "not a template", "not a shadcn card grid", "game-like", "specific to AI training camp", "mobile-first". The existing `web/src/styles.css` is already slightly editorial (Cormorant Garamond + Manrope, warm pastel + teal accent, grid noise texture) — we are not starting from a gray dashboard. But it is also not "game-like" yet. Each direction below is evaluated against the 5 segments and the AQ 5-dim radar, and self-scored on "will this look like a template."

The skill `ecc:frontend-design` (see §11) already ships a taxonomy: editorial, brutalist, retro-futuristic, luxury, playful, bento, art deco, industrial, soft pastel. We pick the 6 most relevant for a training camp leaderboard.

### 4.1 V1 — Editorial / magazine

- **Vibe:** Asymmetric grid, giant display serif, generous negative space, photo or texture accents, rank positions treated like magazine feature-story numbers.
- **References:** Bloomberg Businessweek digital, New York Times "The Year in Pictures" package, Awwwards "Bandit Running" leaderboard (sources §11).
- **Palette direction:**
  - `--surface: oklch(98% 0.01 60)` (warm paper)
  - `--ink: oklch(15% 0 0)` (deep ink)
  - `--accent: oklch(62% 0.22 25)` (vermillion feature color)
  - `--accent-alt: oklch(68% 0.15 180)` (editorial teal)
  - `--highlight: oklch(90% 0.18 95)` (mustard for Lv.5 only)
- **Typography:** Display = Cormorant Garamond or Freight Display (existing), body = Manrope. Headings at `clamp(3rem, 7vw, 8rem)`.
- **Motion budget:** Subtle — fade + slide for chart reveals, no bounce.
- **Fit for 5 segments:** Moderate. Segments become "chapter headers" in a magazine layout. Works but feels less game.
- **Fit for AQ radar:** Good. Radar rendered as a large, almost decorative feature in one hero panel.
- **Mobile feasibility:** Good if the asymmetric grid collapses to a single column of "story cards."
- **Template risk:** Low. The existing project already starts here, so the shift is small. Beautiful but quiet.

### 4.2 V2 — Neo-brutalism (hard shadows, thick borders)

- **Vibe:** Flat color, chunky borders, hard black shadows, display mono or wide sans, oversized rank numerals, no gradients.
- **References:** [Gumroad's new direction](https://gumroad.com), [Awwwards brutalism collection](https://www.awwwards.com/inspiration-search/?text=brutalism), "Stacked Camp" leaderboard on Awwwards (§11).
- **Palette direction:**
  - `--bg: oklch(96% 0.02 95)` (cream)
  - `--ink: oklch(10% 0 0)` (near black)
  - `--accent: oklch(72% 0.23 140)` (lime green)
  - `--accent-alt: oklch(70% 0.22 25)` (tomato red)
  - `--accent-bg: oklch(85% 0.18 55)` (orange block)
- **Typography:** Display = Space Grotesk Bold or IBM Plex Mono, body = Inter. Border weight = 3px solid black.
- **Motion:** Medium — transform + shadow shift on hover. Cards "slam" into place.
- **Fit for 5 segments:** Excellent. Flat color blocks per segment, stark tier boundaries.
- **Fit for AQ radar:** Moderate. Radar in flat color works; may feel chunky.
- **Mobile feasibility:** Excellent. Brutalist layouts survive stacking well.
- **Template risk:** Medium — brutalism itself has become a "template look" in 2025-26.

### 4.3 V3 — Dark arcade / retro gaming

- **Vibe:** Dark OLED background, CRT scanlines, pixel font headings, neon accents, 8-bit tier badges, phosphor green readouts. The AI training camp = "game", lean in.
- **References:** Steam game stats pages, retro arcade cabinets, Vampire Survivors end-of-run screens, Balatro UI, Diablo season pass leaderboards.
- **Palette direction:**
  - `--bg: oklch(14% 0.02 265)` (deep navy-black)
  - `--ink: oklch(92% 0 0)` (off-white)
  - `--accent-cyan: oklch(82% 0.17 210)` (scanline cyan)
  - `--accent-pink: oklch(72% 0.25 340)` (neon pink)
  - `--accent-lime: oklch(88% 0.21 130)` (phosphor green)
- **Typography:** Display = Press Start 2P or VT323, body = JetBrains Mono or Space Grotesk.
- **Motion:** Hero — glitch sweeps on rank changes, typewriter reveal on numbers, scanline overlay animation, subtle particles on Lv.5 badge.
- **Fit for 5 segments:** Perfect. Each tier = arcade sprite with a neon glow. "AI 奇点玩家" literally feels like a boss tier.
- **Fit for AQ radar:** Excellent. Pentagon radar fits the arcade aesthetic naturally.
- **Mobile feasibility:** Good. Dark background saves OLED battery.
- **Template risk:** Very low. Almost nobody ships this.

### 4.4 V4 — Dark luxury (OLED + gold)

- **Vibe:** Pitch-black background, thin type, gold accents, slow micro-interactions. "Private club" aesthetic.
- **References:** Rolex, Aston Martin, Apple Watch Hermes, Patek Philippe owner portal.
- **Palette direction:**
  - `--bg: oklch(8% 0 0)` (true black)
  - `--ink: oklch(95% 0 0)` (cool white)
  - `--accent-gold: oklch(80% 0.13 85)`
  - `--accent-gold-deep: oklch(55% 0.15 75)`
  - `--hairline: oklch(30% 0 0)`
- **Typography:** Display = Playfair Display Light or Cormorant, body = Neue Haas Grotesk. Hairline rules at 1px.
- **Motion:** Slow fades, smooth parallax on scroll. No bounces.
- **Fit for 5 segments:** Interesting. Each tier gets a different gold-to-ink gradient; Lv.5 becomes the darkest / most-restrained tier. Counter-intuitive but works.
- **Fit for AQ radar:** Good. Thin gold lines on black.
- **Mobile feasibility:** Good.
- **Template risk:** Low-medium. Luxury dashboards exist but this combination for a training camp is unusual.

### 4.5 V5 — Bento grid (varied tiles)

- **Vibe:** Apple WWDC bento layout. Different tile sizes, each with a different purpose (rank big tile, dimension radar medium tile, streak small tile, promotion history long tile). Tiles have their own color treatment.
- **References:** Apple iPhone 15 site, Linear changelog, Vercel dashboards, Rauno Freiberg work.
- **Palette direction:**
  - `--bg: oklch(98% 0.005 270)`
  - `--ink: oklch(18% 0 0)`
  - 5 tile accent colors, one per dimension (K blue, H orange, C purple, S green, G yellow)
- **Typography:** Display = Geist or Satoshi Bold, body = Geist Mono for stats.
- **Motion:** Medium. Tiles rearrange on breakpoint change, hover lifts.
- **Fit for 5 segments:** Moderate. Segments become big tiles; hard to show all 5 without clutter.
- **Fit for AQ radar:** Good. Radar = one tile.
- **Mobile feasibility:** Tiles stack vertically; preserves rhythm.
- **Template risk:** High. Bento is the 2025-26 default dashboard look; risks blending into Linear/Vercel/Raycast lookalikes.

### 4.6 V6 — Scrollytelling single-page narrative

- **Vibe:** The leaderboard is a scroll-driven story. Section 1 = "This window's champion", section 2 = "Who moved up", section 3 = "Promotion history timeline". Each section pins while charts animate in.
- **References:** Pudding.cool, NYT "Snowfall", Stripe press "Transactions shipped" pages.
- **Palette direction:** Can adopt any of the other palettes; scrollytelling is a layout / motion pattern, not a color palette.
- **Typography:** Display = serif or grotesk, body = clean sans.
- **Motion:** Hero. IntersectionObserver-driven pinning, chart reveals on scroll, cinematic pacing.
- **Fit for 5 segments:** Excellent. Segments become "chapters" of the story.
- **Fit for AQ radar:** Excellent. Radar fills each chapter's hero moment.
- **Mobile feasibility:** Moderate. Scrollytelling is expensive on mid-range Android; must fall back to static reveals on `prefers-reduced-motion`.
- **Template risk:** Low.

### 4.7 Visual direction matrix

| # | Direction | Segment fit | AQ radar fit | Mobile | Motion | Template risk | Heritage from existing CSS |
|---|---|---|---|---|---|---|---|
| V1 | Editorial | Moderate | Good | Good | Subtle | Low | **High** — already starts here |
| V2 | Neo-brutalism | Excellent | Moderate | Excellent | Medium | Medium | Low |
| V3 | Dark arcade | **Perfect** | Excellent | Good | Hero | **Very low** | Low |
| V4 | Dark luxury | Interesting | Good | Good | Subtle | Low-medium | Low |
| V5 | Bento | Moderate | Good | Good | Medium | **High** | Medium |
| V6 | Scrollytelling | Excellent | Excellent | Moderate | Hero | Low | Moderate |

---

## 5. Screen inventory

7 screens. Data requirements reference sub-project 1 routes (sources §11). Not a design — just surface enumeration.

### S1 — Leaderboard home (`/`)

- **Route:** `/` (or `/board`)
- **Data:**
  - `GET /api/v2/board/ranking?campId=camp-demo` → `{ rows: [{memberId, memberName, avatarUrl, currentLevel, cumulativeAq, latestWindowAq, dimensions: {K,H,C,S,G}, rank}] }` (sub1 plan Task G7)
- **Key interactions:**
  - Tap a row → navigate to member detail S2
  - Filter by segment (Lv.1-Lv.5)
  - Sort toggle: latest window AQ vs cumulative AQ
- **Mobile notes:** Stack rows vertically; each row is a full-width card showing rank + avatar + name + tier badge + AQ.

### S2 — Member detail (`/m/:memberId`)

- **Route:** `/m/:memberId`
- **Data:**
  - `GET /api/v2/board/member/:id` → `MemberBoardDetail { memberId, memberName, avatarUrl, currentLevel, promotions[], dimensionSeries[], windowSnapshots[] }` (sub1 plan Task G8)
- **Key interactions:**
  - AQ 5-dim radar (current window)
  - Promotion history timeline (horizontal strip by window)
  - Dimension history micro-sparklines (K/H/C/S/G across W1..W5)
  - Back to leaderboard
- **Mobile notes:** Vertical stack: header (name + tier badge) → big radar → timeline → sparklines.

### S3 — Window detail (`/w/:windowCode`)

- **Route:** `/w/:windowCode` (`W1`..`W5`, `FINAL`)
- **Data:**
  - Derived from `windowSnapshots` array in each member's `/api/v2/board/member/:id` call, **OR** a new aggregated endpoint. `[unknown: need to verify whether sub1 exposes a per-window endpoint or whether the dashboard joins client-side]`
- **Key interactions:**
  - Window summary (who promoted, who held, growth bonuses triggered)
  - Top-3 per dimension
  - Filter: show only promotions / show all
- **Mobile notes:** Collapsible sections per dimension.

### S4 — Promotion replay (`/m/:memberId/promotion/:windowCode`)

- **Route:** `/m/:memberId/promotion/:windowCode`
- **Data:** `promotion_records.reason` JSON payload (serialized decision tree output)
- **Key interactions:**
  - Show which conditions fired, which path (`primary`, `alternate`, `protection_discounted`, `final_bonus`)
  - Celebration micro-animation for promoted, quiet badge update for held
- **Mobile notes:** Vertical scroll through the condition checklist.

### S5 — Segment roster (`/tier/:level`)

- **Route:** `/tier/:level` (e.g. `/tier/3` = all "AI 操盘手")
- **Data:** filter from `GET /api/v2/board/ranking?campId=...` in memory
- **Key interactions:**
  - Shows all members currently in this tier
  - Shows the tier's next-level requirements (`Lv.3 → Lv.4` rules)
  - Shows a "distance to next tier" bar for each member
- **Mobile notes:** Tier hero banner + stacked member list.

### S6 — Achievements / badges (`/m/:memberId/badges`)

- **Route:** `/m/:memberId/badges` (optional)
- **Data:** Derived. `[unknown: need to verify whether sub1 exposes achievements or whether we synthesize them from dimension scores]`
- **Key interactions:**
  - Show unlocked badges (e.g. "First to submit homework", "3+ 点赞 on a C1 share", "4-day streak")
  - Show locked badges with hint
- **Mobile notes:** Grid of 2-column badges.

### S7 — Operator console (`/ops`)

- **Route:** `/ops`
- **Data:**
  - `GET /api/v2/admin/review-queue`
  - `GET /api/v2/admin/members`
  - `PATCH /api/v2/admin/members/:id`
- **Key interactions:** Review queue decisions (approve/reject), member patches (hide from board, role change).
- **Mobile notes:** Minimal — operators often use desktop. Keep primary-column wide.

Screen total: **7**. Trimmable to 5 if we remove S5 (tier roster) and S6 (badges) for MVP.

---

## 6. AQ 5-dimension data viz options

All 5 dimensions are `K`, `H`, `C`, `S`, `G` (知识力, 动手力, 创造力, 社交力, 成长力). Each has a per-period cap and the window-level score is a sum. Per `scoring_item_events` and `member_dimension_scores` tables (sub1 spec §2.2.4, §2.2.5).

### 6.1 VZ1 — Pentagon radar chart (classic)

- **Library:** `recharts` `<RadarChart>`, or D3 custom pentagon (see §11 for D3 examples).
- **Anim potential:** Smooth polygon tween as values change; layered "previous window" polygon underneath in a faded color.
- **Mobile readability:** Good at 280-360px SVG.
- **Template risk:** Medium. Every RPG uses this.
- **Pros:** Universally readable, directly maps 5 dimensions to 5 axes.
- **Cons:** Can look generic if not styled carefully.

### 6.2 VZ2 — Stacked vertical bars (5 stacks)

- **Library:** `recharts` `<BarChart>` stacked, or hand-SVG.
- **Anim potential:** Bars grow from 0 on mount; color-coded per dimension.
- **Mobile readability:** Excellent on narrow screens; bars stack naturally.
- **Template risk:** Low-medium.
- **Pros:** Clear ordinal comparison across members.
- **Cons:** Less iconic than a radar. Harder to see "shape" at a glance.

### 6.3 VZ3 — Pentagon gauge (segment fills)

- **Library:** Custom SVG with clip paths.
- **Anim potential:** Each segment fills separately on mount; pulsing glow when a dimension hits cap.
- **Mobile readability:** Good if labels are large.
- **Template risk:** Low. Uncommon.
- **Pros:** Very game-like. Each dimension feels like a gauge on a spaceship console.
- **Cons:** Custom SVG, more dev time. Axis labels can crowd.

### 6.4 VZ4 — Dimension timeline (small multiples)

- **Library:** `visx`, D3, or SVG hand-rolled.
- **Anim potential:** Drawing lines on mount via `stroke-dasharray` animation.
- **Mobile readability:** Excellent. 5 small sparklines in a vertical stack.
- **Template risk:** Low.
- **Pros:** Shows evolution over W1..W5, which is the real story of the program.
- **Cons:** Not immediate. Requires context to read.

### 6.5 VZ5 — "vs cohort" split bullet chart

- **Library:** Custom SVG.
- **Anim potential:** Marker slides into place per dimension.
- **Mobile readability:** Good.
- **Template risk:** Low.
- **Pros:** Shows "you vs everyone else" for each dimension.
- **Cons:** Less hero, more analytical. Misses the game feel.

### 6.6 AQ viz matrix

| # | Viz | Library | Anim | Mobile | Template risk | Game feel |
|---|---|---|---|---|---|---|
| VZ1 | Pentagon radar | recharts / D3 | Smooth tween | Good | Medium | High |
| VZ2 | Stacked bars | recharts | Grow | Excellent | Low-med | Medium |
| VZ3 | Pentagon gauge | custom SVG | Per-segment fill | Good | Low | **Very high** |
| VZ4 | Dimension timeline | visx / D3 | Line draw | Excellent | Low | Medium |
| VZ5 | Vs cohort bullet | custom SVG | Marker slide | Good | Low | Low |

Likely pattern: **primary = VZ1 (radar) + supplementary = VZ4 (timeline)** or **VZ3 + VZ4**.

---

## 7. In-group access mechanism

How does a student get from "I see a card in the group" to "I'm on my member detail page"? All four options below have been observed in the Feishu platform documentation (§11).

### 7.1 M1 — Card action button → H5 URL open-in-webview

- **Flow:** Student taps button on a Feishu interactive card → bot receives `card.action.trigger` → bot replies with a "jump" action → Feishu opens the URL in the in-app webview.
- **Dev cost:** Low. `@larksuiteoapi/node-sdk` already installed (`package.json` v1.42.0).
- **UX:** Card button feels native; tap → webview slides in over the chat → back button returns to chat.
- **Auth flow:** Once inside the webview, `tt.requestAccess` returns an authCode, backend exchanges for user info. JSSDK auto-initialized.
- **Back-nav:** Feishu webview has a native back / close button. Returns to the chat.
- **Pros:** Feels native, no external redirect, auth is automatic.
- **Cons:** Requires the Feishu "网页应用" capability to be registered (dependency on sub2). The URL must be in the app's trusted redirect allowlist.

### 7.2 M2 — Card button → external browser open

- **Flow:** Card button opens the URL using the system browser (Safari, Chrome).
- **Dev cost:** Lowest. No capabilities, no approval.
- **UX:** Jarring — student leaves Feishu, goes to browser, loses context. No auth.
- **Pros:** No platform approval needed.
- **Cons:** Ugly, explicitly bad for the "美观 / 学员零门槛" user constraint in the Aliyun baseline §4.2.

### 7.3 M3 — 工作台 icon entry ("网页应用")

- **Flow:** Student sees "AI 训练营评分" icon in Feishu 工作台 → taps → opens our H5 inside Feishu webview.
- **Dev cost:** Low-medium. Requires app version publication and admin approval.
- **UX:** Slightly cold — student has to navigate to 工作台 rather than tapping a card in chat. Good for "I want to check anytime."
- **Pros:** One-time setup, then available forever. No per-card state.
- **Cons:** Not in-line with the group chat; students won't see it when a promotion happens.

**M1 + M3 are complementary**, not exclusive. Likely pattern: use both — 工作台 icon for self-driven checking + card button for "you just got promoted" moments.

### 7.4 M4 — Feishu 小程序 (gadget)

- **Flow:** Card button → open a Feishu gadget (native-feeling mini-program) → render via Feishu's gadget runtime.
- **Dev cost:** High. Different DSL, different tooling, separate build, separate review process.
- **UX:** Most polished, most native-feeling.
- **Pros:** Best feel, full access to Feishu UI primitives.
- **Cons:** Overkill for 14 users. Adds weeks of dev time. Probably not justified.

### 7.5 Access mechanism matrix

| # | Mechanism | Dev cost | UX | Auth | Back-nav | Recommended? |
|---|---|---|---|---|---|---|
| M1 | Card button → webview | Low | Native-feel | Auto (JSSDK) | Feishu native | **Yes** |
| M2 | Card button → system browser | Lowest | Jarring | None | Poor | No |
| M3 | 工作台 icon | Low-medium | Cold but reliable | Auto | Feishu native | **Yes, complement** |
| M4 | 小程序 gadget | High | Best native-feel | Auto | Feishu native | No (over-invest) |

---

## 8. Auth / identity model

Sub1 spec §5 defines "bootstrap operators", `isEligibleStudent`, and `role_type`. Sub1's admin routes already use `x-feishu-open-id` headers (see `requireAdmin` in plan Task G9-G10). So the question is: what does the dashboard expose for non-admin viewers?

### 8.1 A1 — Full transparency (everyone sees everything)

- All 14 students see every other student's name, rank, tier, AQ, dimension scores.
- Operators see everything + review queue + member patches.
- **Auth:** `x-feishu-open-id` header for identifying "who am I" so we can highlight my row. For eligibility checks, trust the Feishu session inside the webview.
- **Pros:** Gamified competition depends on visibility. Matches the 5.3 growth bonus logic which already assumes students can see their standing.
- **Cons:** Could expose dimension weaknesses publicly. Pfizer cultural considerations. `[unknown: need to verify Pfizer HBU expectations on visibility]`

### 8.2 A2 — Semi-private (self + cohort summary)

- Each student sees **their own** full detail (radar, history, dimensions) + **cohort leaderboard** showing names and AQ but **not** dimension breakdowns.
- Operators see full details of everyone + review queue.
- **Auth:** Same as A1, but the `/api/v2/board/member/:id` route would need a check: only return full detail if `:id === currentUser.memberId` OR `currentUser.roleType === 'operator'`.
- **Pros:** Preserves motivation (leaderboard visible) while hiding granular weaknesses from peers.
- **Cons:** Requires sub1 to extend Task G8 with access control — a scope change for sub1. `[unknown: need to verify whether sub1 is willing to add this gate]`

### 8.3 A3 — Self-only + operator dashboard

- Each student sees **only their own** detail page.
- The leaderboard is only available to operators, and is distributed via broadcast cards after each window settlement.
- **Auth:** Same headers, strict filter.
- **Pros:** Maximum privacy, minimal leak.
- **Cons:** Kills the gamification. The whole point of "AI 奇点玩家" is public recognition. Contradicts the business rules §8 "结业当天随段位评定结果一并公布."

### 8.4 Auth model matrix

| # | Model | Who sees what | Impacts sub1 scope? | Gamification |
|---|---|---|---|---|
| A1 | Full transparency | Everyone sees everything | No (current default) | Excellent |
| A2 | Self + cohort summary | Own detail + names/AQ only for others | **Yes** — G8 needs a gate | Good |
| A3 | Self-only + operator dashboard | Own detail only, leaderboard private | No | Poor |

---

## 9. Open questions (for brainstorming)

Each is decision-forcing. The user should walk out of the brainstorming session with an answer for each.

### Q1. Do we commit to "Feishu H5 only" or do we also need a public URL?

- **Why it matters:** Determines whether H1 is enough or whether we also need H3. It also determines whether `prefers-color-scheme` and standalone browser fallback are must-haves.
- **Candidates:**
  - **A.** H1 only (Feishu proxy + SWAS, inside-Feishu access only). Simplest. Depends on Feishu cert tolerance `[unknown]`.
  - **B.** H3 (named Cloudflare tunnel + existing domain). Stable and externally visible. Requires an existing domain the user hasn't confirmed.
  - **C.** Both H1 and H3 as parallel entry points.

### Q2. Do we keep the existing React SPA (F1) or pivot to Astro islands (F2) or Fastify views (F3)?

- **Why it matters:** The sub1 Phase I Task I1 is already planning to delete `web/src/**`. If we write the new dashboard in the same folder under a fresh commit, we can't share the deletion. If we pivot to Astro or Fastify views, we don't fight the cleanup.
- **Candidates:**
  - **A.** F1 — stay on React SPA. Familiar, existing CSS (`styles.css`) is already editorial-adjacent. But we'll be rebuilding after sub1 deletes the folder.
  - **B.** F2 — Astro + React islands. Smallest bundle on mobile, fits a read-mostly dashboard. New tool to learn.
  - **C.** F3 — Fastify views + micro-JS. Simplest deploy, smallest JS, but loses React component reuse.
  - **D.** F4 — Next.js. Unlikely given overkill.

### Q3. Which primary visual direction?

- **Why it matters:** Locks the identity of the product. Hardest to reverse.
- **Candidates:**
  - **V1 Editorial** — lowest risk, closest to existing.
  - **V2 Neo-brutalism** — playful, high impact, medium template risk.
  - **V3 Dark arcade** — strongest "game" match, lowest template risk, highest reinvention.
  - **V6 Scrollytelling + any palette** — most storytelling, moderate mobile risk.
- **Meta-question:** does the user want the dashboard to feel like a **game** (V3) or a **magazine** (V1/V6) or a **trophy room** (V4)?

### Q4. What is the "hero moment" per window?

- **Why it matters:** Drives the animation / motion budget. Every gamified product has one moment that feels euphoric. We need to know which moment earns expensive motion.
- **Candidates:**
  - **A.** Promotion cinematic — when a student tier-ups, they get a full-screen celebration.
  - **B.** Rank change reveal — when window settles, the leaderboard "shuffles" with a satisfying sort animation.
  - **C.** AQ radar growth — the new radar polygon animates from last window to this window.
  - **D.** Boss tier badge — when the first person hits Lv.5, the whole dashboard changes state.

### Q5. Do students see dimension breakdowns for peers or only their own?

- **Why it matters:** Auth model A1 vs A2. Affects sub1 scope (Q8 in §8).
- **Candidates:**
  - **A.** Full transparency (A1). Matches gamification best.
  - **B.** Semi-private (A2). Safer. Adds sub1 scope.
  - **C.** Full privacy for dimensions, but rank and AQ public. Middle ground.

### Q6. What is the primary AQ 5-dimension visualization?

- **Why it matters:** Defines identity of member detail page. Drives library choice.
- **Candidates:**
  - **A.** Pentagon radar (VZ1) alone. Classic, template-risky.
  - **B.** Pentagon gauge (VZ3) alone. Game-like, more work.
  - **C.** Radar (VZ1) + dimension timeline (VZ4) duo. Standard + story.
  - **D.** Gauge (VZ3) + timeline (VZ4) duo. Game-like + story.

### Q7. Operator console — shipped together with student dashboard, or separately?

- **Why it matters:** Scope inflation. Operator console is a different surface. If we ship together, we need auth gating in sub3 too.
- **Candidates:**
  - **A.** Ship together, single app, role-based rendering.
  - **B.** Ship student dashboard first, operator console in a follow-up.
  - **C.** Operator console ships as a separate Fastify server-rendered area (F3 for ops, any stack for students).

### Q8. Should promotion results trigger a full-screen celebration in the dashboard, or a subtle badge update?

- **Why it matters:** Motion budget and "pomp." A full-screen celebration is euphoric but reinterrupts the user.
- **Candidates:**
  - **A.** Full-screen celebration with confetti / sound (must be muted by default).
  - **B.** Subtle badge update + a notification dot.
  - **C.** Promotion replay page (S4) as the dedicated "celebration canvas."

### Q9. Do we publish a Feishu 网页应用 (H5 app registration) now, or only after the dashboard is built?

- **Why it matters:** Publishing the app requires admin approval inside the Pfizer tenant. This is non-engineering work on a critical path.
- **Candidates:**
  - **A.** Publish now so the dev loop uses the real 工作台 icon from day one.
  - **B.** Use localhost + Feishu PC client's local-debug for dev, publish only for staging.
  - **C.** Publish a "stub" app immediately just to reserve the icon slot and security allowlist, iterate on the real URL later.

---

## 10. Constraints and risks

### 10.1 Hard constraints

| ID | Constraint | Source |
|---|---|---|
| C1 | No ICP-registered domain | Aliyun baseline §4.2 |
| C2 | No domain purchase | Aliyun baseline §4.2 |
| C3 | No ICP wait (15-20 days unacceptable) | Aliyun baseline §4.2 |
| C4 | No "trust untrusted cert" step for students | Aliyun baseline §4.2 |
| C5 | Single SWAS 2C2G 200 Mbps only | Aliyun baseline §3 |
| C6 | 80/443 inbound on SWAS triggers unfiled-web auto-ban if used for unfiled HTTP web | Aliyun baseline §4.1 |
| C7 | Dashboard must consume `/api/v2/board/ranking` and `/api/v2/board/member/:id` as defined (do not rewrite) | sub1 plan Task G7, G8 |
| C8 | Must coexist with the Fastify instance that runs sub1's domain + sub2's card protocol | sub1 spec §1.1 |
| C9 | Mobile-first (Feishu mobile clients are the primary surface for students) | sub3 task brief |
| C10 | Existing `web/src/**` is scheduled for deletion under sub1 Phase I Task I1 | sub1 plan lines 9602–9622 |

### 10.2 Known risks

| ID | Risk | Severity | Notes |
|---|---|---|---|
| R1 | Feishu 网页应用 proxy may refuse self-signed SWAS backends | **High** | `[unknown: need to verify]` Would invalidate H1. |
| R2 | Quick Cloudflare tunnel subdomain churn (H2) | High | Incompatible with Feishu allowlist model. |
| R3 | Pfizer admin approval delay for publishing 网页应用 | Medium | Could delay in-group access even after code is ready. |
| R4 | Sub1 `/api/v2/board/*` may not include enough data for the dashboard (e.g. dimension series per window) | Medium | Spec says it does; plan Task G8 says `windowSnapshots` array is included. Verify shape. |
| R5 | Pfizer data visibility policy may block A1 (full transparency) | Medium | `[unknown: need to verify]` |
| R6 | Mobile WebView on older Feishu clients (<V3.44) lacks JSSDK `getUserInfo` | Low | Sub1 spec assumes modern clients anyway. |
| R7 | Scrollytelling (V6) performance on mid-range Android | Low-medium | Mitigable via `prefers-reduced-motion` fallback. |
| R8 | 5MB static cache bust on every new window settlement | Low | Trivial at 14-user scale. |
| R9 | Replacing deleted `web/src/**` vs parallel-track cohabitation | Medium | Coordination dependency with sub1 Phase I. |
| R10 | Operator console scope creep | Medium | Open question Q7 — if combined with student dashboard, sub3 doubles in size. |

---

## 11. Recommended next step

1. **Run the brainstorming session** against §9's 9 questions. Do not pick an option in this document alone.
2. **Resolve the 3 critical unknowns** before committing to H1:
   - R1: Does Feishu 网页应用 proxy tolerate self-signed SWAS backends, or do we need a trusted cert? Options to verify: write a 30-minute spike — register a throwaway app, point it to SWAS with a self-signed cert, see if Feishu opens it.
   - R5: Does Pfizer HBU culture tolerate full transparency (A1)? Single conversation with the business owner.
   - Does the operator have any non-Aliyun domain registered (needed for H3 as a fallback)?
3. **Coordinate with sub1 Phase I Task I1** so the old `web/src/**` deletion happens in a single atomic commit and the new sub3 code lands on a clean slate (use a new folder name, e.g. `apps/dashboard/` or `dashboard-web/`, to avoid any shared-history confusion).
4. **Ship a "design spike"** after the direction is chosen: one S1 Leaderboard home + one S2 Member detail page, in the chosen stack + visual direction, deployed via the chosen hosting path, reviewed end-to-end on an actual Feishu mobile client before committing to full buildout.

---

## 11. Sources

### Local files (repo)

- Business rules: `D:/Vibe Coding Project/AI Seed Project/output/AI训练营_14人进阶规则.md` (sections 一.段位体系, 二.进阶时间轴, 三.AQ 五维, 四.段位进阶条件, 五.防极端机制, 六.进阶可行性模拟, 八.段位奖金激励)
- Aliyun capability baseline: `D:/Vibe Coding Project/AI Seed Project/docs/aliyun-capability-baseline-2026-04-10.md` (sections §2, §3, §4.1-4.3, §6)
- Aliyun MCP consumption: `D:/Vibe Coding Project/AI Seed Project/docs/aliyun-mcp-consumption.md`
- Sub1 spec: `D:/Vibe Coding Project/AI Seed Project/.worktrees/phase-one-feishu/docs/superpowers/specs/2026-04-10-scoring-v2-core-domain-design.md` (sections 0.2, 1.3, 2.2, 3.1-3.6)
- Sub1 plan: `D:/Vibe Coding Project/AI Seed Project/.worktrees/phase-one-feishu/docs/superpowers/plans/2026-04-10-scoring-v2-core-domain.md` (Task G7 Board ranking, Task G8 Member detail, Task G9-G11 admin routes, Phase I Task I1 legacy cleanup)
- Existing frontend code: `D:/Vibe Coding Project/AI Seed Project/web/src/App.tsx`, `D:/Vibe Coding Project/AI Seed Project/web/src/styles.css`, `D:/Vibe Coding Project/AI Seed Project/web/src/types.ts`, `D:/Vibe Coding Project/AI Seed Project/web/src/lib/api.ts`, `D:/Vibe Coding Project/AI Seed Project/web/src/components/ranking-table.tsx`
- `package.json`: `D:/Vibe Coding Project/AI Seed Project/package.json` (confirms React 19 + Vite 7 + Fastify 5 + TypeScript 5.9 + `@larksuiteoapi/node-sdk` 1.42.0)
- Existing Feishu native plan: `D:/Vibe Coding Project/AI Seed Project/docs/superpowers/plans/2026-04-07-feishu-native-phase-one-implementation.md` (sections about `FEISHU_LEARNER_HOME_DOC_TOKEN` and entry contract tests)
- Entry contract tests: `D:/Vibe Coding Project/AI Seed Project/tests/api/app.test.ts` (lines 470-481) and `D:/Vibe Coding Project/AI Seed Project/tests/services/feishu-bootstrap.test.ts` (lines 66-86)

### Web sources

- [Feishu Web App overview](https://open.feishu.cn/document/client-docs/h5/introduction) — platform support (Android, iOS, PC, Harmony), JSAPI, constraint on "high network quality required"
- [Feishu getUserInfo API](https://open.feishu.cn/document/client-docs/gadget/-web-app-api/open-ability/userinfo/getuserinfo) — web apps cannot use `withCredentials: true`; requires prior auth setup; client versions V3.44.0+
- [Feishu requestAuthCode (deprecated) / requestAccess](https://open.feishu.cn/document/client-docs/gadget/-web-app-api/open-ability/login/20220308) — `requestAuthCode` is deprecated in favor of `requestAccess` for web app SSO
- [Feishu sample: web app with auth](https://github.com/larksuite/lark-samples/blob/main/web_app_with_auth/python/README.md)
- [Feishu custom app trusted domain / redirect allowlist](https://docs.authing.cn/v2/en/guides/connections/enterprise/lark-internal/) — custom apps require configuring redirect URL allowlist in Security Settings
- [Cloudflare Quick Tunnels (trycloudflare) — dev only](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/) — random subdomain, 200 concurrent request limit, no SSE, not suitable for production
- [Cloudflare Tunnel setup (named tunnels require a DNS domain)](https://developers.cloudflare.com/tunnel/setup/)
- [Cloudflare Tunnels FAQ — stable hostnames](https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/)
- [Astro vs Next.js bundle comparison (2025-26)](https://eastondev.com/blog/en/posts/dev/20251202-astro-vs-nextjs-comparison/) — Astro 8KB vs Next.js 85KB homepage bundles; 40% faster, 90% less JS
- [Next.js 16 vs Remix vs Astro 2025](https://dev.to/saswatapal/nextjs-16-vs-remix-vs-astro-choosing-the-right-react-framework-in-2025-3lio)
- [D3.js radar chart gallery](https://d3-graph-gallery.com/spider) — pentagon (NUM_OF_SIDES=5) for 5-dim character stats
- [Radar chart with Recharts / React graph gallery](https://www.react-graph-gallery.com/radar-chart)
- [Awwwards "Stacked Camp" leaderboard](https://www.awwwards.com/inspiration/leaderboard-stacked-camp) — gamified user leaderboard reference
- [Awwwards "Bandit Running" leaderboard](https://www.awwwards.com/inspiration/bandit-scroll-leaderboard-bandit-running) — scroll-driven gamification
- [Awwwards gamification collection](https://www.awwwards.com/inspiration/gamification)
- [Gamification strategy — when to use leaderboards](https://medium.com/design-bootcamp/gamification-strategy-when-to-use-leaderboards-7bef0cf842e1)
- [Duolingo gamification playbook (leaderboards, streaks, XP)](https://www.orizon.co/blog/duolingos-gamification-secrets) — XP leaderboards drive 40% more engagement; streaks increase commitment 60%
- [frontend-design skill taxonomy (anthropics)](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) — bold aesthetic directions: editorial, brutalist, retro-futuristic, luxury, playful, bento, art deco
- [ICP filing general guide (China)](https://www.chinafy.com/blog/a-2025-guide-to-icp-licences-in-china-do-i-need-an-icp-license-for-my-website)
