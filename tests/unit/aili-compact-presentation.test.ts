import { describe, expect, it } from "vitest";
import { emptyCacheTelemetry, type CacheTelemetry, type SessionCacheStats } from "../../src/runtime/aili-compact/cache.js";
import {
  MIN_CACHE_PANEL_COLUMNS,
  cacheDisplayWidth,
  cacheNumericRenderKey,
  cacheWidgetVisibility,
  presentCache,
  renderCacheWidget,
  shouldRerenderCacheWidget,
} from "../../src/runtime/aili-compact/presentation.js";

function sessionFrom(telemetry: CacheTelemetry): SessionCacheStats {
  const promptTokens = telemetry.input + telemetry.cacheRead + telemetry.cacheWrite;
  return {
    assistantResponses: promptTokens > 0 ? 1 : 0,
    telemetryUnavailable: 0,
    input: telemetry.input,
    output: 0,
    cacheRead: telemetry.cacheRead,
    cacheWrite: telemetry.cacheWrite,
    ...(promptTokens > 0 ? { hitRate: (telemetry.cacheRead / promptTokens) * 100 } : {}),
  };
}

function present(telemetry: CacheTelemetry, panelEnabled = true, terminalColumns = 120) {
  return presentCache({ session: sessionFrom(telemetry), telemetry, activeBlocks: 2, panelEnabled, terminalColumns });
}

describe("AILI Compact cache presentation", () => {
  it("presents eligible telemetry at or above the 85% target", () => {
    const result = present({ ...emptyCacheTelemetry(), eligible: 3, cacheRead: 900, input: 100, hitRate: 90 });

    expect(result.status).toBe("eligible");
    expect(result.footer).toBe("缓存：当前 Session 90.0%｜AILI 90.0% 正常");
    expect(result.overlay.title).toBe("AILI Compact 缓存");
    expect(result.overlay.lines).toContain("【当前 Session 缓存统计（当前分支）】");
    expect(result.overlay.lines).toContain("普通输入：100 · 输出：0");
    expect(result.overlay.lines).toContain("缓存读取：900 · 缓存写入：0");
    expect(result.overlay.lines).toContain("【AILI 重复请求缓存稳定性诊断】");
    expect(result.overlay.lines).toContain("有效请求滚动命中率：90.0%（目标 ≥ 85.0%）");
    expect(result.panel.visibility).toBe("visible");
  });

  it("marks eligible telemetry below the target as a warning", () => {
    const result = present({ ...emptyCacheTelemetry(), eligible: 2, cacheRead: 80, input: 20, hitRate: 80 });

    expect(result.status).toBe("below-target");
    expect(result.footer).toBe("缓存：当前 Session 80.0%｜AILI 80.0% 警告");
    expect(result.overlay.lines).toContain("有效请求滚动命中率：80.0%（低于目标 85.0%）");
  });

  it("shows cold requests as excluded rather than inventing a hit rate", () => {
    const result = present({ ...emptyCacheTelemetry(), ineligibleCold: 1 });

    expect(result.status).toBe("cold");
    expect(result.footer).toBe("缓存：当前 Session 暂无｜AILI 冷启动");
    expect(result.overlay.lines).toContain("有效请求滚动命中率：暂无（冷启动）");
  });

  it("shows state changes as excluded rather than treating them as cold hits", () => {
    const result = present({ ...emptyCacheTelemetry(), ineligibleStateChange: 1 });

    expect(result.status).toBe("state-change");
    expect(result.footer).toBe("缓存：当前 Session 暂无｜AILI 状态变化");
    expect(result.overlay.lines).toContain("有效请求滚动命中率：暂无（状态变化）");
  });

  it("labels missing provider telemetry as unavailable without a synthetic rate", () => {
    const result = present({ ...emptyCacheTelemetry(), unavailable: 1 });

    expect(result.status).toBe("telemetry-unavailable");
    expect(result.footer).toBe("缓存：当前 Session 暂无｜AILI 遥测不可用");
    expect(result.overlay.lines).toContain("有效请求滚动命中率：暂无（遥测不可用）");
  });

  it("decides panel visibility from its toggle and terminal width only", () => {
    const telemetry = { ...emptyCacheTelemetry(), eligible: 1, hitRate: 90 };

    expect(present(telemetry, true, MIN_CACHE_PANEL_COLUMNS - 1).panel.visibility).toBe("narrow");
    expect(present(telemetry, false, MIN_CACHE_PANEL_COLUMNS).panel.visibility).toBe("disabled");
    expect(present(telemetry, true, MIN_CACHE_PANEL_COLUMNS).panel.visibility).toBe("visible");
  });

  it("uses only numeric metadata in panel content and its render key", () => {
    const telemetry = { ...emptyCacheTelemetry(), eligible: 1, cacheRead: 85, input: 15, hitRate: 85 };
    const result = present(telemetry);

    expect(result.panel.renderKey).toBe("2:1:0:15:0:85:0:85:1:0:0:0:0:85:0:15:85");
    expect(result.panel.lines).toHaveLength(5);
    expect(result.panel.lines[0]).toMatch(/^【当前 Session 缓存统计（当前分支）】\s+【AILI 重复请求缓存稳定性诊断】$/);
    expect(result.panel.lines[1]).toMatch(/^命中率：85\.0%\s+有效请求滚动命中率：85\.0%（目标 ≥ 85\.0%）$/);
    expect(result.panel.lines[4]).toMatch(/^缓存读取：85 · 缓存写入：0\s+活跃压缩块：2$/);
    expect(result.panel.lines.join("\n")).not.toMatch(/prompt|source|tool output/i);
  });

  it("provides responsive visibility and numeric-only rerender helpers", () => {
    const telemetry = { ...emptyCacheTelemetry(), eligible: 5, window: Array.from({ length: 5 }, () => ({ input: 15, cacheRead: 85, cacheWrite: 0 })), hitRate: 85 };
    const session = sessionFrom(telemetry);
    const key = cacheNumericRenderKey(session, telemetry, 2);

    expect(cacheWidgetVisibility(true, MIN_CACHE_PANEL_COLUMNS - 1)).toBe("narrow");
    expect(renderCacheWidget({ session, telemetry, activeBlocks: 2, panelEnabled: true }, MIN_CACHE_PANEL_COLUMNS - 1)).toEqual([]);
    expect(renderCacheWidget({ session, telemetry, activeBlocks: 2, panelEnabled: true }, MIN_CACHE_PANEL_COLUMNS)).not.toEqual([]);
    expect(shouldRerenderCacheWidget(key, session, telemetry, 2)).toBe(false);
    expect(shouldRerenderCacheWidget(key, session, { ...telemetry, unavailable: 1 }, 2)).toBe(true);
  });

  it("renders current Session left-aligned and AILI diagnostics right-aligned in paired columns", () => {
    const telemetry = { ...emptyCacheTelemetry(), ineligibleCold: 1, ineligibleStateChange: 26 };
    const session: SessionCacheStats = {
      assistantResponses: 841,
      telemetryUnavailable: 0,
      input: 4_941_628,
      output: 468_880,
      cacheRead: 149_248_512,
      cacheWrite: 0,
      hitRate: 96.8,
    };
    const result = presentCache({ session, telemetry, activeBlocks: 0, panelEnabled: true, terminalColumns: 160 });

    expect(result.panel.lines).toHaveLength(5);
    expect(result.panel.lines[0]).toMatch(/^【当前 Session 缓存统计（当前分支）】\s+【AILI 重复请求缓存稳定性诊断】$/);
    expect(result.panel.lines[1]).toMatch(/^命中率：96\.8%\s+有效请求滚动命中率：暂无（状态变化）$/);
    expect(result.panel.lines[2]).toMatch(/^模型响应：841 · 遥测不可用：0\s+有效：0 · 冷启动：1$/);
    expect(result.panel.lines[3]).toMatch(/^普通输入：4,941,628 · 输出：468,880\s+状态变化：26 · 遥测不可用：0$/);
    expect(result.panel.lines[4]).toMatch(/^缓存读取：149,248,512 · 缓存写入：0\s+活跃压缩块：0$/);
    expect(result.panel.lines.map(cacheDisplayWidth)).toEqual([158, 158, 158, 158, 158]);
  });

  it("marks one through four eligible samples insufficient", () => {
    const telemetry = {
      ...emptyCacheTelemetry(),
      eligible: 4,
      window: Array.from({ length: 4 }, () => ({ input: 10, cacheRead: 85, cacheWrite: 5 })),
      input: 40,
      cacheRead: 340,
      cacheWrite: 20,
    };
    const result = present(telemetry);
    expect(result.status).toBe("insufficient-sample");
    expect(result.footer).toBe("缓存：当前 Session 85.0%｜AILI 样本不足 4/5");
  });
});
