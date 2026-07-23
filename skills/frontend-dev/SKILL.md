---
name: frontend-dev
description: |
  Build rich marketing/media frontend experiences with cinematic motion, AI assets, copy, and generative art.
---

# Frontend Studio

Build rich marketing/media frontend pages as one primary domain loop. Use only the design, motion, asset, copy, or generative-art techniques required by the accepted deliverable; do not treat them as separate process workflows.

## Natural-Language Usage

Use this OpenCode skill when the user asks for a rich visual frontend experience in natural language, such as "build a landing page for a music streaming app".

## Routing Boundary

Use this skill for standalone or campaign-like frontend work where the deliverable depends on premium visual design, cinematic scroll/motion, persuasive copy, AI-generated media assets, or generative art. Production app UI, backend integration, and shader-only work are near misses returned to ROSE so it can select one narrower primary owner.

Do not use this skill for ordinary CRUD screens, dashboard fixes, isolated component styling, backend/API work, native mobile apps, or shader-only work. If rich media assets are not required, return the mismatch to ROSE so it can select the narrower primary owner; do not invoke that skill here.

ROSE/`aili-delivery-flow` selects exactly one of `frontend-dev`, `frontend-ui-engineering`, or `fullstack-dev` as the primary domain owner for the current intent. This skill does not invoke another domain/process skill; it returns one concrete backend, browser, source, asset, or verification need to ROSE and stops `complete`, `need-user`, `need-evidence`, `material-delta`, `blocked`, or `Unverified`. Safe local work proceeds without micro-approval; external asset generation, credentials, dependency changes, and publication retain exact gates. Canonical lifecycle approval and claim-matched verification override generic phase/checklist breadth below.

| Trigger | Use this skill? | Why |
|---|---:|---|
| "Build a cinematic product landing page with hero video" | Yes | Rich marketing/media frontend |
| "Generate imagery and copy for a campaign page" | Yes | AI assets + persuasive copy |
| "Fix this dashboard form state" | No | Return mismatch to ROSE; app UI is the narrower candidate |
| "Add an API and database behind this UI" | No | Return mismatch to ROSE; full-stack integration is the narrower candidate |
| "Write only a WebGL fragment shader" | No | Return mismatch to ROSE; shader work is the narrower candidate |

## Skill Structure

This skill uses local `scripts/` for MiniMax asset generation, `references/` for CLI/prompt/motion details, `templates/` for visual art, and `canvas-fonts/` for static art typography. Read only the relevant resource for the task.

## Project Structure

### Assets (Universal)

All frameworks use the same asset organization:

```
assets/
├── images/
│   ├── hero-landing-1710xxx.webp
│   ├── icon-feature-01.webp
│   └── bg-pattern.svg
├── videos/
│   ├── hero-bg-1710xxx.mp4
│   └── demo-preview.mp4
└── audio/
    ├── bgm-ambient-1710xxx.mp3
    └── tts-intro-1710xxx.mp3
```

**Asset naming:** `{type}-{descriptor}-{timestamp}.{ext}`

### By Framework

| Framework | Asset Location | Component Location |
|-----------|---------------|-------------------|
| **Pure HTML** | `./assets/` | N/A (inline or `./js/`) |
| **React/Next.js** | `public/assets/` | `src/components/` |
| **Vue/Nuxt** | `public/assets/` | `src/components/` |
| **Svelte/SvelteKit** | `static/assets/` | `src/lib/components/` |
| **Astro** | `public/assets/` | `src/components/` |

Keep sections/components in the framework's normal component directory (`src/components`, `src/lib/components`, or Astro `src/components`), assets in the static asset directory above, and component names in PascalCase (`HeroSection.tsx`, `HeroSection.vue`, `HeroSection.astro`).

---

## Compliance

The specialized design/accessibility/safety constraints apply when their feature is selected. Generic quality lists do not create full-suite, review, package, or completion gates beyond the canonical owner.

---

## Workflow
### Phase 1: Design Architecture
1. Analyze the request — determine page type and context
2. Set design dials based on page type
3. Plan layout sections and identify asset needs

### Phase 2: Motion Architecture
1. Select animation tools per section (see Tool Selection Matrix)
2. Plan motion sequences following performance guardrails

### Phase 3: Asset Generation
Generate all image/video/audio assets using `scripts/`. NEVER use placeholder URLs (unsplash, picsum, placeholder.com, via.placeholder, placehold.co, etc.) or external URLs.

1. Parse asset requirements (type, style, spec, usage)
2. Craft optimized prompts; obtain only the exact external generation approval when policy requires it, without adding a separate prompt-approval gate
3. Execute via scripts, save to project — do NOT proceed to Phase 5 until all assets are saved locally

🔴 CHECKPOINT / 🛑 STOP: If the request only needs layout/components and does not require premium media, motion, copy, or generative art, return the mismatch to ROSE before generating assets; this skill does not invoke `frontend-ui-engineering`.

### Phase 4: Copywriting & Content
Follow copywriting frameworks (AIDA, PAS, FAB) to craft all text content. Do NOT use "Lorem ipsum" — write real copy.

### Phase 5: Build UI
Scaffold the project and build each section following Design and Motion rules. Integrate generated assets and copy. All `<img>`, `<video>`, `<source>`, and CSS `background-image` MUST reference local assets from Phase 3.

### Phase 6: Quality Gates
Run final checklist (see Quality Gates section).

---

# 1. Design Engineering

## 1.1 Baseline Configuration

| Dial | Default | Range |
|------|---------|-------|
| DESIGN_VARIANCE | 8 | 1=Symmetry, 10=Asymmetric |
| MOTION_INTENSITY | 6 | 1=Static, 10=Cinematic |
| VISUAL_DENSITY | 4 | 1=Airy, 10=Packed |

Adapt dynamically based on user requests.

## 1.2 Architecture Conventions
- **DEPENDENCY VERIFICATION:** Check `package.json` before importing any library. If missing, return the exact dependency decision to ROSE; do not install or change a lockfile without approval.
- **Framework:** React/Next.js. Default to Server Components. Interactive components must be isolated `"use client"` leaf components.
- **Styling:** Tailwind CSS. Check version in `package.json` — NEVER mix v3/v4 syntax.
- **ANTI-EMOJI POLICY:** NEVER use emojis anywhere. Use Phosphor or Radix icons only.
- **Viewport:** Use `min-h-[100dvh]` not `h-screen`. Use CSS Grid not flex percentage math.
- **Layout:** `max-w-[1400px] mx-auto` or `max-w-7xl`.

## 1.3 Design Rules
| Rule | Directive |
|------|-----------|
| Typography | Headlines: `text-4xl md:text-6xl tracking-tighter`. Body: `text-base leading-relaxed max-w-[65ch]`. **NEVER** use Inter — use Geist/Outfit/Satoshi. **NEVER** use Serif on dashboards. |
| Color | Max 1 accent, saturation < 80%. **NEVER** use AI purple/blue. Stick to one palette. |
| Layout | **NEVER** use centered heroes when VARIANCE > 4. Force split-screen or asymmetric layouts. |
| Cards | **NEVER** use generic cards when DENSITY > 7. Use `border-t`, `divide-y`, or spacing. |
| States | **ALWAYS** implement: Loading (skeleton), Empty, Error, Tactile feedback (`scale-[0.98]`). |
| Forms | Label above input. Error below. `gap-2` for input blocks. |

## 1.4 Anti-Slop Techniques

- **Liquid Glass:** `backdrop-blur` + `border-white/10` + `shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]`
- **Magnetic Buttons:** Use `useMotionValue`/`useTransform` — never `useState` for continuous animations
- **Perpetual Motion:** When INTENSITY > 5, add infinite micro-animations (Pulse, Float, Shimmer)
- **Layout Transitions:** Use Framer `layout` and `layoutId` props
- **Stagger:** Use `staggerChildren` or CSS `animation-delay: calc(var(--index) * 100ms)`

## 1.5 Forbidden Patterns
| Category | Banned |
|----------|--------|
| Visual | Neon glows, pure black (#000), oversaturated accents, gradient text on headers, custom cursors |
| Typography | Inter font, oversized H1s, Serif on dashboards |
| Layout | 3-column equal card rows, floating elements with awkward gaps |
| Components | Default shadcn/ui without customization |

## 1.6 Creative Arsenal

Use high-variance patterns only when they serve the campaign: bento/masonry/split-screen layouts, parallax/spotlight/glass cards, sticky or horizontal scroll storytelling, kinetic text, hover trails, mesh gradients, SVG draw, lens blur, and particle accents.

## 1.7 Bento Paradigm

- **Palette:** Background `#f9fafb`, cards pure white with `border-slate-200/50`
- **Surfaces:** `rounded-[2.5rem]`, diffusion shadow
- **Typography:** Geist/Satoshi, `tracking-tight` headers
- **Labels:** Outside and below cards
- **Animation:** Spring physics (`stiffness: 100, damping: 20`), infinite loops, `React.memo` isolation

**5-Card Archetypes:**
1. Intelligent List — auto-sorting with `layoutId`
2. Command Input — typewriter + blinking cursor
3. Live Status — breathing indicators
4. Wide Data Stream — infinite horizontal carousel
5. Contextual UI — staggered highlight + float-in toolbar

## 1.8 Brand Override

When brand styling is active:
- Dark: `#141413`, Light: `#faf9f5`, Mid: `#b0aea5`, Subtle: `#e8e6dc`
- Accents: Orange `#d97757`, Blue `#6a9bcc`, Green `#788c5d`
- Fonts: Poppins (headings), Lora (body)

---

# 2. Motion Engine

## 2.1 Tool Selection Matrix

| Need | Tool |
|------|------|
| UI enter/exit/layout | **Framer Motion** — `AnimatePresence`, `layoutId`, springs |
| Scroll storytelling (pin, scrub) | **GSAP + ScrollTrigger** — frame-accurate control |
| Looping icons | **Lottie** — lazy-load (~50KB) |
| 3D/WebGL | **Three.js / R3F** — isolated `<Canvas>`, own `"use client"` boundary |
| Hover/focus states | **CSS only** — zero JS cost |
| Native scroll-driven | **CSS** — `animation-timeline: scroll()` |

**Conflict Rules [MANDATORY]:**
- NEVER mix GSAP + Framer Motion in same component
- R3F MUST live in isolated Canvas wrapper
- ALWAYS lazy-load Lottie, GSAP, Three.js

## 2.2 Intensity Scale

| Level | Techniques |
|-------|------------|
| 1-2 Subtle | CSS transitions only, 150-300ms |
| 3-4 Smooth | CSS keyframes + Framer animate, stagger ≤3 items |
| 5-6 Fluid | `whileInView`, magnetic hover, parallax tilt |
| 7-8 Cinematic | GSAP ScrollTrigger, pinned sections, horizontal hijack |
| 9-10 Immersive | Full scroll sequences, Three.js particles, WebGL shaders |

## 2.3 Animation Recipes

See `references/motion-recipes.md` for full code. Summary:

| Recipe | Tool | Use For |
|--------|------|---------|
| Scroll Reveal | Framer | Fade+slide on viewport entry |
| Stagger Grid | Framer | Sequential list animations |
| Pinned Timeline | GSAP | Horizontal scroll with pinning |
| Tilt Card | Framer | Mouse-tracking 3D perspective |
| Magnetic Button | Framer | Cursor-attracted buttons |
| Text Scramble | Vanilla | Matrix-style decode effect |
| SVG Path Draw | CSS | Scroll-linked path animation |
| Horizontal Scroll | GSAP | Vertical-to-horizontal hijack |
| Particle Background | R3F | Decorative WebGL particles |
| Layout Morph | Framer | Card-to-modal expansion |

## 2.4 Performance Rules
**GPU-only properties (ONLY animate these):** `transform`, `opacity`, `filter`, `clip-path`

**NEVER animate:** `width`, `height`, `top`, `left`, `margin`, `padding`, `font-size` — if you need these effects, use `transform: scale()` or `clip-path` instead.

**Isolation:**
- Perpetual animations MUST be in `React.memo` leaf components
- `will-change: transform` ONLY during animation
- `contain: layout style paint` on heavy containers

**Mobile:**
- ALWAYS respect `prefers-reduced-motion`
- ALWAYS disable parallax/3D on `pointer: coarse`
- Cap particles: desktop 800, tablet 300, mobile 100
- Disable GSAP pin on mobile < 768px

**Cleanup:** Every `useEffect` with GSAP/observers MUST `return () => ctx.revert()`

## 2.5 Springs & Easings

| Feel | Framer Config |
|------|---------------|
| Snappy | `stiffness: 300, damping: 30` |
| Smooth | `stiffness: 150, damping: 20` |
| Bouncy | `stiffness: 100, damping: 10` |
| Heavy | `stiffness: 60, damping: 20` |

| CSS Easing | Value |
|------------|-------|
| Smooth decel | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Smooth accel | `cubic-bezier(0.7, 0, 0.84, 0)` |
| Elastic | `cubic-bezier(0.34, 1.56, 0.64, 1)` |

## 2.6 Accessibility
- ALWAYS wrap motion in `prefers-reduced-motion` check
- NEVER flash content > 3 times/second (seizure risk)
- ALWAYS provide visible focus rings (use `outline` not `box-shadow`)
- ALWAYS add `aria-live="polite"` for dynamically revealed content
- ALWAYS include pause button for auto-playing animations

## 2.7 Dependencies

```bash
npm install framer-motion           # UI (keep at top level)
npm install gsap                    # Scroll (lazy-load)
npm install lottie-react            # Icons (lazy-load)
npm install three @react-three/fiber @react-three/drei  # 3D (lazy-load)
```

---

# 3. Asset Generation

## 3.1 Scripts

| Type | Script | Pattern |
|------|--------|---------|
| TTS | `scripts/minimax_tts.py` | Sync |
| Music | `scripts/minimax_music.py` | Sync |
| Video | `scripts/minimax_video.py` | Async (create → poll → download) |
| Image | `scripts/minimax_image.py` | Sync |

Env: `MINIMAX_API_KEY` (required).

## 3.2 Workflow
1. **Parse:** type, quantity, style, spec, usage
2. **Craft prompt:** Be specific (composition, lighting, style). **NEVER** include text in image prompts.
3. **Execute:** Return the exact external generation operation to ROSE for approval when required, then run it; do not add a second prompt-approval gate
4. **Save:** `<project>/public/assets/{images,videos,audio}/` as `{type}-{descriptor}-{timestamp}.{ext}` — **MUST save locally**
5. **Post-process:** Images → WebP, Videos → ffmpeg compress, Audio → normalize
6. **Deliver:** File path + code snippet + CSS suggestion

## 3.3 Asset Failure Fallback

| Trigger | First action | If still failing |
|---|---|---|
| `MINIMAX_API_KEY` missing or invalid | Return the credential need and local-fallback option to ROSE | Treat the fallback as a material output decision when it changes the accepted visual target; mark AI media generation unverified |
| MiniMax script exits with an error | Report the exact command and stderr; do not retry an external operation implicitly | Return any changed-evidence retry need to ROSE; do not replace with placeholder URLs |
| Video async job times out or download fails | Report the timeout and current returned asset URL/path evidence | Return retry versus local-treatment options to ROSE when they change the output or require another external operation |
| Generated asset is off-brand, text-filled, or unusable | Prepare the corrected prompt without executing it | Return regeneration versus simpler local treatment to ROSE when a material choice or external approval is required |

🔴 CHECKPOINT / 🛑 STOP: Never proceed to UI integration while required media files are missing. Return a material fallback decision or exact external retry need to ROSE, or stop `blocked`/`Unverified`.

## 3.4 Preset Shortcuts

| Shortcut | Spec |
|----------|------|
| `hero` | 16:9, cinematic, text-safe |
| `thumb` | 1:1, centered subject |
| `icon` | 1:1, flat, clean background |
| `avatar` | 1:1, portrait, circular crop ready |
| `banner` | 21:9, OG/social |
| `bg-video` | 768P, 6s, `[Static shot]` |
| `video-hd` | 1080P, 6s |
| `bgm` | 30s, no vocals, loopable |
| `tts` | MiniMax HD, MP3 |

## 3.5 Reference

- `references/minimax-cli-reference.md` — CLI flags
- `references/asset-prompt-guide.md` — Prompt rules
- `references/minimax-voice-catalog.md` — Voice IDs
- `references/minimax-tts-guide.md` — TTS usage
- `references/minimax-music-guide.md` — Music generation (prompts, lyrics, structure tags)
- `references/minimax-video-guide.md` — Camera commands
- `references/minimax-image-guide.md` — Ratios, batch

---

# 4. Copywriting

## 4.1 Core Job

1. Grab attention → 2. Create desire → 3. Remove friction → 4. Prompt action

## 4.2 Frameworks

**AIDA** (landing pages, emails):
```
ATTENTION:  Bold headline (promise or pain)
INTEREST:   Elaborate problem ("yes, that's me")
DESIRE:     Show transformation
ACTION:     Clear CTA
```

**PAS** (pain-driven products):
```
PROBLEM:    State clearly
AGITATE:    Make urgent
SOLUTION:   Your product
```

**FAB** (product differentiation):
```
FEATURE:    What it does
ADVANTAGE:  Why it matters
BENEFIT:    What customer gains
```

## 4.3 Headlines

Use promise, question, how-to, numbered, negative, curiosity, or transformation headlines. Be specific and lead with outcome, not method.

## 4.4 CTAs

**Bad:** Submit, Click here, Learn more

**Good:** "Start my free trial", "Get the template now", "Book my strategy call"

**Formula:** [Action Verb] + [What They Get] + [Urgency/Ease]

Place: above fold, after value, multiple on long pages.

## 4.5 Emotional Triggers

Use FOMO, fear of loss, status, ease, frustration, or hope only when appropriate to the product and audience.

## 4.6 Objection Handling

| Objection | Response |
|-----------|----------|
| Too expensive | Show ROI: "Pays for itself in 2 weeks" |
| Won't work for me | Social proof from similar customer |
| No time | "Setup takes 10 minutes" |
| What if it fails | "30-day money-back guarantee" |
| Need to think | Urgency/scarcity |

Place in FAQ, testimonials, near CTA.

## 4.7 Proof Types

Testimonials (with name/title), Case studies, Data/metrics, Social proof, Certifications

---

# 5. Visual Art

Philosophy-first workflow. Two output modes.

## 5.1 Output Modes

| Mode | Output | When |
|------|--------|------|
| Static | PDF/PNG | Posters, print, design assets |
| Interactive | HTML (p5.js) | Generative art, explorable variations |

## 5.2 Workflow

### Step 1: Philosophy Creation
Name the movement (1-2 words). Articulate philosophy (4-6 paragraphs) covering:
- Static: space, form, color, scale, rhythm, hierarchy
- Interactive: computation, emergence, noise, parametric variation

### Step 2: Conceptual Seed
Identify subtle, niche reference — sophisticated, not literal. Jazz musician quoting another song.

### Step 3: Creation

**Static Mode:**
- Single page, highly visual, design-forward
- Repeating patterns, perfect shapes
- Sparse typography from `canvas-fonts/`
- Nothing overlaps, proper margins
- Output: `.pdf` or `.png` + philosophy `.md`

**Interactive Mode:**
1. Read `templates/viewer.html` first
2. Keep FIXED sections (header, sidebar, seed controls)
3. Replace VARIABLE sections (algorithm, parameters)
4. Seeded randomness: `randomSeed(seed); noiseSeed(seed);`
5. Output: single self-contained HTML

### Step 4: Refinement
Refine, don't add. Make it crisp. Polish into masterpiece.

---

# Quality Gates
**Design:**
- [ ] Mobile layout collapse (`w-full`, `px-4`) for high-variance designs
- [ ] `min-h-[100dvh]` not `h-screen`
- [ ] Empty, loading, error states provided
- [ ] Cards omitted where spacing suffices

**Motion:**
- [ ] Correct tool per selection matrix
- [ ] No GSAP + Framer mixed in same component
- [ ] All `useEffect` have cleanup returns
- [ ] `prefers-reduced-motion` respected
- [ ] Perpetual animations in `React.memo` leaf components
- [ ] Only GPU properties animated
- [ ] Heavy libraries lazy-loaded

**General:**
- [ ] Dependencies verified in `package.json`
- [ ] **No placeholder URLs** — grep the output for `unsplash`, `picsum`, `placeholder`, `placehold`, `via.placeholder`, `lorem.space`, `dummyimage`. If ANY found, STOP and replace with generated assets before delivering.
- [ ] **All media assets exist as local files** in the project's assets directory
- [ ] Asset prompts confirmed with user before generation
- [ ] MiniMax/env/script failures were either recovered or explicitly reported with a user-approved fallback

---

*React and Next.js are trademarks of Meta Platforms, Inc. and Vercel, Inc., respectively. Vue.js is a trademark of Evan You. Tailwind CSS is a trademark of Tailwind Labs Inc. Svelte and SvelteKit are trademarks of their respective owners. GSAP/GreenSock is a trademark of GreenSock Inc. Three.js, Framer Motion, Lottie, Astro, and all other product names are trademarks of their respective owners.*
