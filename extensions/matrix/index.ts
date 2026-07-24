import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const WIDGET_KEY = "rose-matrix-engine";
const CONFIG_PATH = join(homedir(), ".pi", "agent", "rose-cyberdeck-matrix.json");
const LEGACY_CONFIG_PATH = join(homedir(), ".pi", "agent", "sakura-cyberdeck-matrix.json");
const RESET = "\x1b[0m";
const MAX_DROPS = 96;
const SHIMMER_STEP_MS = 120;
const TOOL_GRADIENT: readonly RGB[] = [[188, 167, 255], [125, 228, 255]];

export const ROSE_MATRIX_GLYPHS = [..."0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾗﾘﾙﾚﾛﾜﾝ"];
/** The six user-selected rain colors, assigned by the exact weights below. */
export const ROSE_RAIN_PALETTE: readonly RGB[] = [
  [136, 184, 255], [214, 244, 255], [125, 228, 255],
  [188, 167, 255], [199, 91, 122], [232, 167, 184],
];
export const ROSE_RAIN_WEIGHTS = { blue: 50, ice: 20, cyan: 15, violet: 8, rose: 4, roseSoft: 3 } as const;
export const ROSE_SHIMMER_INDICATOR = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"] as const;

type RGB = readonly [number, number, number];
export type Appearance = "auto" | "dark" | "light";
export type ResolvedAppearance = Exclude<Appearance, "auto">;
export type Phase = "requesting" | "thinking" | "working" | "tool";
type Timer = ReturnType<typeof setTimeout>;

export interface MatrixConfig {
  version: 2;
  enabled: boolean;
  fps: number;
  density: number;
  height: 4;
  appearance: Appearance;
}

export interface Drop {
  /** Fixed terminal-cell column; vertical motion never changes this value. */
  x: number;
  offset: number;
  speed: number;
  length: number;
  gap: number;
  seed: number;
  color: RGB;
}

type ConfigLoadResult = { config: MatrixConfig; migrated: boolean; warning?: string };

const DEFAULT_CONFIG: MatrixConfig = {
  version: 2,
  enabled: true,
  fps: 12,
  density: 0.65,
  height: 4,
  appearance: "auto",
};

const PHASE_MESSAGES: Record<Phase, string> = {
  requesting: "Connecting to the model…",
  thinking: "Weaving the next move…",
  working: "Composing the response…",
  tool: "Running tools…",
};

const DARK = {
  fade: [16, 18, 29] as RGB,
  base: [136, 184, 255] as RGB,
  highlight: [214, 244, 255] as RGB,
  indicator: [199, 91, 122] as RGB,
};
const LIGHT = {
  fade: [250, 247, 242] as RGB,
  base: [92, 115, 151] as RGB,
  highlight: [42, 38, 34] as RGB,
  indicator: [168, 69, 95] as RGB,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSafeRegularFile(path: string): boolean {
  try {
    const link = lstatSync(path);
    return !link.isSymbolicLink() && statSync(path).isFile();
  } catch {
    return false;
  }
}

function parseConfig(value: unknown): MatrixConfig {
  const parsed = isRecord(value) ? value : {};
  return {
    version: 2,
    enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_CONFIG.enabled,
    fps: clamp(Math.round(Number(parsed.fps) || DEFAULT_CONFIG.fps), 8, 18),
    density: clamp(Number(parsed.density) || DEFAULT_CONFIG.density, 0.45, 0.95),
    height: 4,
    appearance: parsed.appearance === "dark" || parsed.appearance === "light" || parsed.appearance === "auto"
      ? parsed.appearance
      : "auto",
  };
}

function writeConfigAtomically(path: string, config: MatrixConfig): void {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path) && !isSafeRegularFile(path)) {
    throw new Error(`Refusing to overwrite unsafe Matrix config: ${path}`);
  }
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  try {
    writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    renameSync(temp, path);
  } catch (error) {
    try { unlinkSync(temp); } catch {}
    throw error;
  }
}

export function loadRoseMatrixConfig(
  path = CONFIG_PATH,
  legacyPath = LEGACY_CONFIG_PATH,
): ConfigLoadResult {
  if (existsSync(path)) {
    if (!isSafeRegularFile(path)) return { config: { ...DEFAULT_CONFIG }, migrated: false, warning: "Rose Matrix config is unsafe; using runtime defaults." };
    try {
      return { config: parseConfig(JSON.parse(readFileSync(path, "utf8"))), migrated: false };
    } catch {
      return { config: { ...DEFAULT_CONFIG }, migrated: false, warning: "Rose Matrix config is corrupt; using runtime defaults." };
    }
  }
  if (!existsSync(legacyPath)) return { config: { ...DEFAULT_CONFIG }, migrated: false };
  if (!isSafeRegularFile(legacyPath)) return { config: { ...DEFAULT_CONFIG }, migrated: false, warning: "Legacy Sakura Matrix config is unsafe; using runtime defaults." };
  try {
    const legacy = JSON.parse(readFileSync(legacyPath, "utf8"));
    if (!isRecord(legacy)) throw new Error("not an object");
    const config = parseConfig(legacy);
    writeConfigAtomically(path, config);
    return { config, migrated: true, warning: Number(legacy.height) !== 4 ? "Legacy Matrix height was normalized to four rows." : undefined };
  } catch {
    return { config: { ...DEFAULT_CONFIG }, migrated: false, warning: "Legacy Sakura Matrix config is corrupt; using runtime defaults." };
  }
}

export function resolveAppearance(appearance: Appearance, themeName: string | undefined): ResolvedAppearance | undefined {
  if (appearance === "dark" || appearance === "light") return appearance;
  if (themeName === "light") return "light";
  if (themeName === "dark" || themeName === "rose-cyberdeck" || themeName === "rem-cyberdeck") return "dark";
  return undefined;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let n = value;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(from: RGB, to: RGB, amount: number): RGB {
  return [
    Math.round(from[0] + (to[0] - from[0]) * amount),
    Math.round(from[1] + (to[1] - from[1]) * amount),
    Math.round(from[2] + (to[2] - from[2]) * amount),
  ];
}

function colorize(char: string, color: RGB, bold = false): string {
  return `\x1b[${bold ? "1;" : ""}38;2;${color[0]};${color[1]};${color[2]}m${char}${RESET}`;
}

function fillWidth(content: string, width: number): string {
  const clipped = truncateToWidth(content, Math.max(1, width), "");
  return `${clipped}${" ".repeat(Math.max(0, width - visibleWidth(clipped)))}`;
}

function stableGlyph(seed: number, row: number, timeSlice: number): string {
  let hash = Math.imul(seed ^ (row + 17), 0x45d9f3b);
  hash = Math.imul(hash ^ timeSlice, 0x45d9f3b);
  hash ^= hash >>> 16;
  return ROSE_MATRIX_GLYPHS[Math.abs(hash) % ROSE_MATRIX_GLYPHS.length] ?? "0";
}

function selectBoundedColumns(columns: readonly number[]): number[] {
  if (columns.length <= MAX_DROPS) return [...columns];
  const lastIndex = columns.length - 1;
  return Array.from({ length: MAX_DROPS }, (_, index) => columns[Math.round((index * lastIndex) / (MAX_DROPS - 1))] ?? 0);
}

/** Exact 50/20/15/8/4/3 distribution over each deterministic 100-track cycle. */
export function roseRainColor(index: number): RGB {
  // A coprime stride distributes all weights through the 96-track ceiling,
  // instead of leaving the final Rose/Soft Rose buckets unreachable.
  const bucket = (((index * 37) % 100) + 100) % 100;
  if (bucket < 50) return ROSE_RAIN_PALETTE[0]!;
  if (bucket < 70) return ROSE_RAIN_PALETTE[1]!;
  if (bucket < 85) return ROSE_RAIN_PALETTE[2]!;
  if (bucket < 93) return ROSE_RAIN_PALETTE[3]!;
  if (bucket < 97) return ROSE_RAIN_PALETTE[4]!;
  return ROSE_RAIN_PALETTE[5]!;
}

export function createDrops(width: number, density: number, height = 4): Drop[] {
  const random = mulberry32((width * 2654435761) ^ 0x53414b55);
  const columns = Array.from({ length: Math.ceil(width / 2) }, (_, index) => index * 2);
  const active = columns.filter(() => random() < density);
  const selected = active.length >= 8 ? active : columns.slice(0, Math.min(columns.length, 8));
  return selectBoundedColumns(selected).map((x, index) => {
    const length = 3 + Math.floor(random() * 5);
    const gap = 1 + Math.floor(random() * 5);
    const cycle = height + length + gap;
    return {
      x,
      offset: random() * cycle,
      // Between the released waterfall (5.5–13) and dense preview (18).
      speed: 8 + random() * 8,
      length,
      gap,
      seed: Math.floor(random() * 0x7fffffff) ^ (index * 7919),
      color: roseRainColor(index),
    };
  });
}

function appearanceColor(color: RGB, appearance: ResolvedAppearance): RGB {
  if (appearance === "dark") return color;
  if (color[0] === 199 && color[1] === 91) return LIGHT.indicator;
  if (color[0] === 232 && color[1] === 167) return [168, 69, 95];
  if (color[0] === 188 && color[1] === 167) return [119, 106, 151];
  if (color[0] === 214 || color[1] === 228) return [78, 120, 129];
  return LIGHT.base;
}

function repairBlankRows(grid: string[][], width: number, appearance: ResolvedAppearance, elapsedSeconds: number): void {
  const blanks = grid.map((row) => row.every((cell) => cell === " "));
  if (!blanks.some(Boolean)) return;
  const seed = Math.floor(elapsedSeconds * 8) ^ (width * 7919) ^ 0x524f5345;
  const column = Math.max(0, Math.min(width - 1, Math.abs(seed) % Math.max(1, width)));
  const fallback = appearance === "dark" ? [125, 228, 255] as RGB : [78, 120, 129] as RGB;
  const occupied = grid.findIndex((row) => row.some((cell) => cell !== " "));
  for (let row = 0; row < grid.length; row += 1) {
    if (!blanks[row]) continue;
    const glyph = stableGlyph(seed + row * 97 + Math.max(0, occupied), row, Math.floor(elapsedSeconds * 8));
    grid[row]![column] = colorize(glyph, fallback, row === 0 || row === grid.length - 1);
  }
}

export function renderRoseMatrix(
  width: number,
  height: number,
  elapsedSeconds: number,
  phase: Phase,
  drops: readonly Drop[],
  appearance: ResolvedAppearance = "dark",
): string[] {
  const safeWidth = Math.max(1, width);
  const safeHeight = 4;
  const grid: string[][] = Array.from({ length: safeHeight }, () => Array(safeWidth).fill(" "));
  const timeSlice = Math.floor(elapsedSeconds * 8);
  const phaseSpeed = phase === "tool" ? 1.12 : phase === "thinking" ? 1.06 : 1;
  const palette = appearance === "dark" ? DARK : LIGHT;

  for (const drop of drops) {
    const cycle = safeHeight + drop.length + drop.gap;
    const head = ((drop.offset + elapsedSeconds * drop.speed * phaseSpeed) % cycle) - drop.gap;
    for (let trail = 0; trail < drop.length; trail += 1) {
      const row = Math.floor(head - trail);
      if (row < 0 || row >= safeHeight || drop.x >= safeWidth) continue;
      const glyph = stableGlyph(drop.seed + trail * 97, row, timeSlice);
      const trackColor = appearanceColor(drop.color, appearance);
      const color = trail === 0
        ? mix(trackColor, palette.highlight, 0.58)
        : trail === 1
          ? trackColor
          : mix(trackColor, palette.fade, clamp((trail - 1) * 0.16, 0, 0.72));
      grid[row]![drop.x] = colorize(glyph, color, trail <= 1);
    }
  }
  repairBlankRows(grid, safeWidth, appearance, elapsedSeconds);
  return grid.map((row) => fillWidth(`${row.join("")}${RESET}`, safeWidth));
}

function shimmerIndex(elapsedMs: number): number {
  return Math.floor(Math.max(0, elapsedMs) / SHIMMER_STEP_MS) % ROSE_SHIMMER_INDICATOR.length;
}

function formatElapsed(elapsedMs: number): string | undefined {
  const seconds = Math.floor(Math.max(0, elapsedMs) / 1000);
  if (seconds < 30) return undefined;
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export function renderRoseShimmer(
  width: number,
  phase: Phase,
  elapsedMs: number,
  outputTokens: number | undefined,
  appearance: ResolvedAppearance,
): string {
  const palette = appearance === "dark" ? DARK : LIGHT;
  const indicator = colorize(ROSE_SHIMMER_INDICATOR[shimmerIndex(elapsedMs)]!, palette.indicator, true);
  const message = PHASE_MESSAGES[phase];
  const positions = Math.max(1, message.length - 3);
  const raw = Math.floor(elapsedMs / SHIMMER_STEP_MS) % (positions * 2);
  const start = raw < positions ? raw : positions * 2 - raw - 1;
  const text = [...message].map((char, index) => {
    const base = phase === "tool"
      ? TOOL_GRADIENT[index % TOOL_GRADIENT.length]!
      : palette.base;
    return colorize(char, index >= start && index < start + 4 ? palette.highlight : appearanceColor(base, appearance));
  }).join("");
  const suffix = [formatElapsed(elapsedMs), outputTokens && outputTokens > 0 ? `${outputTokens} output tokens` : undefined]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
  const body = suffix ? `${indicator} ${text} ${suffix}` : `${indicator} ${text}`;
  return fillWidth(body, Math.max(1, width));
}

function assistantUsage(message: unknown): number | undefined {
  if (!isRecord(message) || !isRecord(message.usage)) return undefined;
  const output = message.usage.output;
  return typeof output === "number" && Number.isFinite(output) && output > 0 ? Math.floor(output) : undefined;
}

function isAssistantMessage(message: unknown): boolean {
  return isRecord(message) && message.role === "assistant";
}

export default function roseMatrixExtension(pi: ExtensionAPI): void {
  const loaded = loadRoseMatrixConfig();
  const config = loaded.config;
  let activeContext: ExtensionContext | undefined;
  let phase: Phase = "requesting";
  let active = false;
  let timer: Timer | undefined;
  let startedAt = 0;
  let nextDeadline = 0;
  let lastHostUpdateAt = 0;
  let frame = 0;
  let generation = 0;
  let requestRender: (() => void) | undefined;
  let cachedKey = "";
  let cachedLines: string[] = [];
  let currentAppearance: ResolvedAppearance | undefined;
  let pendingConfigWarning = loaded.warning;
  let warningIssued = false;
  let completedOutputTokens = 0;
  let currentOutputTokens = 0;
  let currentMessageFinalized = false;
  const activeToolIds = new Set<string>();
  const dropsByWidth = new Map<number, Drop[]>();

  const invalidate = () => { cachedKey = ""; cachedLines = []; };
  const totalOutputTokens = () => completedOutputTokens + currentOutputTokens || undefined;

  const stop = () => {
    generation += 1;
    active = false;
    if (timer) clearTimeout(timer);
    timer = undefined;
    const ctx = activeContext;
    activeContext = undefined;
    requestRender = undefined;
    lastHostUpdateAt = 0;
    activeToolIds.clear();
    completedOutputTokens = 0;
    currentOutputTokens = 0;
    currentMessageFinalized = false;
    dropsByWidth.clear();
    invalidate();
    if (!ctx) return;
    try {
      ctx.ui.setWidget(WIDGET_KEY, undefined);
      ctx.ui.setWorkingMessage();
      ctx.ui.setWorkingIndicator();
      ctx.ui.setWorkingVisible(true);
    } catch { /* disposal is idempotent */ }
  };

  const resolveCurrentAppearance = (): ResolvedAppearance | undefined =>
    resolveAppearance(config.appearance, activeContext?.ui.theme.name);

  const schedule = (token: number) => {
    if (!active || token !== generation) return;
    const resolved = resolveCurrentAppearance();
    if (!resolved) {
      const ctx = activeContext;
      stop();
      if (!warningIssued) {
        warningIssued = true;
        ctx?.ui.notify("Rose Matrix needs a known theme; run /rose-matrix appearance dark|light.", "warning");
      }
      return;
    }
    if (resolved !== currentAppearance) { currentAppearance = resolved; invalidate(); }
    const frameMs = 1000 / config.fps;
    const now = performance.now();
    if (now - nextDeadline > frameMs * 3) nextDeadline = now;
    nextDeadline += frameMs;
    timer = setTimeout(() => {
      if (!active || token !== generation) return;
      frame += 1;
      invalidate();
      // Agent/tool streaming already asks Pi to render. Avoid a redundant full
      // TUI pass inside that same frame while still advancing one shared clock.
      if (performance.now() - lastHostUpdateAt >= frameMs) requestRender?.();
      schedule(token);
    }, Math.max(16, nextDeadline - performance.now()));
    timer.unref?.();
  };

  const component = {
    render(width: number): string[] {
      const safeWidth = Math.max(1, width);
      const appearance = currentAppearance ?? "dark";
      const key = `${safeWidth}:${frame}:${phase}:${appearance}:${totalOutputTokens() ?? 0}`;
      if (key === cachedKey) return cachedLines;
      let drops = dropsByWidth.get(safeWidth);
      if (!drops) {
        drops = createDrops(safeWidth, config.density, 4);
        if (dropsByWidth.size >= 4) dropsByWidth.delete(dropsByWidth.keys().next().value ?? safeWidth);
        dropsByWidth.set(safeWidth, drops);
      }
      const elapsedMs = Math.max(0, performance.now() - startedAt);
      cachedLines = [
        renderRoseShimmer(safeWidth, phase, elapsedMs, totalOutputTokens(), appearance),
        ...renderRoseMatrix(safeWidth, 4, elapsedMs / 1000, phase, drops, appearance),
      ];
      cachedKey = key;
      return cachedLines;
    },
    invalidate(): void { dropsByWidth.clear(); invalidate(); },
  };

  const start = (ctx: ExtensionContext, initialPhase: Phase = "requesting") => {
    stop();
    if (!config.enabled || ctx.mode !== "tui") return;
    activeContext = ctx;
    const resolved = resolveCurrentAppearance();
    if (!resolved) {
      activeContext = undefined;
      if (!warningIssued) {
        warningIssued = true;
        ctx.ui.notify("Rose Matrix needs a known theme; run /rose-matrix appearance dark|light.", "warning");
      }
      return;
    }
    active = true;
    currentAppearance = resolved;
    if (pendingConfigWarning) {
      ctx.ui.notify(pendingConfigWarning, "warning");
      pendingConfigWarning = undefined;
    }
    phase = initialPhase;
    frame = 0;
    startedAt = performance.now();
    nextDeadline = startedAt;
    lastHostUpdateAt = 0;
    activeToolIds.clear();
    completedOutputTokens = 0;
    currentOutputTokens = 0;
    currentMessageFinalized = false;
    dropsByWidth.clear();
    invalidate();
    const token = generation;
    ctx.ui.setWorkingVisible(false);
    ctx.ui.setWidget(WIDGET_KEY, (tui) => {
      requestRender = () => tui.requestRender();
      return component;
    });
    schedule(token);
  };

  const noteHostUpdate = () => { lastHostUpdateAt = performance.now(); };

  const setPhase = (next: Phase) => {
    noteHostUpdate();
    if (!active || (activeToolIds.size > 0 && next !== "tool")) return;
    if (phase !== next) { phase = next; frame += 1; invalidate(); }
  };

  const updateUsage = (message: unknown) => {
    const usage = assistantUsage(message);
    if (usage !== undefined && usage >= currentOutputTokens) {
      currentOutputTokens = usage;
      invalidate();
    }
  };

  const beginAssistant = () => {
    currentOutputTokens = 0;
    currentMessageFinalized = false;
    invalidate();
  };
  const finalizeAssistant = (message: unknown) => {
    if (currentMessageFinalized) return;
    updateUsage(message);
    completedOutputTokens += currentOutputTokens;
    currentOutputTokens = 0;
    currentMessageFinalized = true;
    invalidate();
  };

  pi.on("agent_start", (_event, ctx) => start(ctx));
  pi.on("agent_end", () => stop());
  pi.on("session_before_switch", () => stop());
  pi.on("session_shutdown", () => stop());
  pi.on("message_start", (event) => { if (isAssistantMessage(event.message)) beginAssistant(); });
  pi.on("message_end", (event) => { if (isAssistantMessage(event.message)) finalizeAssistant(event.message); });
  pi.on("message_update", (event) => {
    noteHostUpdate();
    const streamEvent = event.assistantMessageEvent;
    updateUsage("partial" in streamEvent ? streamEvent.partial : "message" in streamEvent ? streamEvent.message : "error" in streamEvent ? streamEvent.error : undefined);
    if (streamEvent.type === "thinking_start" || streamEvent.type === "thinking_delta") setPhase("thinking");
    else if (streamEvent.type === "thinking_end") setPhase("requesting");
    else if (streamEvent.type === "text_start" || streamEvent.type === "text_delta") setPhase("working");
    else if (streamEvent.type === "done") finalizeAssistant(streamEvent.message);
    else if (streamEvent.type === "error") finalizeAssistant(streamEvent.error);
  });
  pi.on("tool_execution_start", (event) => { activeToolIds.add(event.toolCallId); setPhase("tool"); });
  pi.on("tool_execution_update", (event) => { noteHostUpdate(); if (activeToolIds.has(event.toolCallId)) setPhase("tool"); });
  pi.on("tool_execution_end", (event) => {
    if (!activeToolIds.delete(event.toolCallId)) return;
    setPhase(activeToolIds.size > 0 ? "tool" : "requesting");
  });

  const handleCommand = async (args: string, ctx: ExtensionContext, deprecated = false) => {
    const [command = "status", value] = args.trim().toLowerCase().split(/\s+/);
    if (deprecated) ctx.ui.notify("/sakura-matrix is deprecated; use /rose-matrix.", "warning");
    if (command === "on" || command === "off") {
      config.enabled = command === "on";
      writeConfigAtomically(CONFIG_PATH, config);
      if (!config.enabled) stop();
      ctx.ui.notify(`Rose Matrix ${config.enabled ? "enabled" : "disabled"}`, "info");
      return;
    }
    if (command === "preview") {
      start(ctx, "thinking");
      const token = generation;
      const previewTimer = setTimeout(() => { if (generation === token) stop(); }, 5000);
      previewTimer.unref?.();
      ctx.ui.notify("Rose Matrix preview: 5 seconds", "info");
      return;
    }
    if (command === "fps") {
      const fps = Number(value);
      if (!Number.isFinite(fps) || fps < 8 || fps > 18) { ctx.ui.notify("Usage: /rose-matrix fps <8-18>", "error"); return; }
      config.fps = Math.round(fps);
      writeConfigAtomically(CONFIG_PATH, config);
      ctx.ui.notify(`Rose Matrix FPS: ${config.fps}`, "info");
      return;
    }
    if (command === "density") {
      const density = Number(value);
      if (!Number.isFinite(density) || density < 0.45 || density > 0.95) { ctx.ui.notify("Usage: /rose-matrix density <0.45-0.95>", "error"); return; }
      config.density = Math.round(density * 100) / 100;
      dropsByWidth.clear();
      writeConfigAtomically(CONFIG_PATH, config);
      ctx.ui.notify(`Rose Matrix density: ${config.density}`, "info");
      return;
    }
    if (command === "appearance") {
      if (value !== "auto" && value !== "dark" && value !== "light") { ctx.ui.notify("Usage: /rose-matrix appearance <auto|dark|light>", "error"); return; }
      config.appearance = value;
      writeConfigAtomically(CONFIG_PATH, config);
      currentAppearance = resolveAppearance(config.appearance, ctx.ui.theme.name);
      invalidate();
      ctx.ui.notify(`Rose Matrix appearance: ${value}`, "info");
      return;
    }
    ctx.ui.notify(`Rose Matrix: ${config.enabled ? "on" : "off"} · ${config.fps} FPS · 4 lines · density ${config.density} · ${config.appearance}`, "info");
  };

  pi.registerCommand("rose-matrix", { description: "Rose Matrix: status, on, off, preview, fps <8-18>, density <0.45-0.95>, appearance <auto|dark|light>", handler: (args, ctx) => handleCommand(args, ctx) });
  pi.registerCommand("sakura-matrix", { description: "Deprecated alias for /rose-matrix", handler: (args, ctx) => handleCommand(args, ctx, true) });
}
