import { describe, expect, it } from 'vitest';
import { solve } from '../../src/core/solve';
import { classify, sortCandidates, type CandidateContext } from '../../src/core/candidates';
import type { Candidate } from '../../src/core/types';
import { db, inputs } from './helpers';

const ctx = (patch: Partial<CandidateContext> = {}): CandidateContext => ({
  t: 12,
  w: 1.6,
  d: 6,
  cMin: 8.1,
  cMax: 10,
  eMin: 6,
  eMax: 9,
  eTarget: 7.5,
  kCap: 1.5,
  hEff: 11,
  clearanceMin: 1.5,
  runout: 1,
  gallingRisk: false,
  ...patch,
});

describe('部分螺紋檢查：b ≥ E + runout（派工單 §5 驗收項）', () => {
  it('無牙段進入攻牙孔 → infeasible', () => {
    const reasons: string[] = [];
    // b=7 < E=7.5 + runout=1 → 8.5
    expect(classify(ctx(), 7.5, 3.5, 7, reasons)).toBe('infeasible');
    expect(reasons[0]).toMatch(/無牙段會進入攻牙孔/);
  });

  it('收尾餘量確實生效：b 恰好等於 E 時仍不合格', () => {
    const reasons: string[] = [];
    // b=7.5 === E=7.5，但需要 8.5
    expect(classify(ctx(), 7.5, 3.5, 7.5, reasons)).toBe('infeasible');
  });

  it('b 恰好等於 E + runout 時通過（閉區間）', () => {
    const reasons: string[] = [];
    expect(classify(ctx(), 7.5, 3.5, 8.5, reasons)).toBe('recommended');
    expect(reasons[0]).toMatch(/✓/);
  });

  it('整條路徑（solve）：短螺紋規格的無牙段進入攻牙孔 → infeasible', () => {
    // 注意：ISO 4762 的 b = 2d+6 相當長，用隨附資料表時這條檢查實際上不會觸發。
    // 這裡改用短螺紋變體（供應商的減牙長品項），才驗得到 solve() 的整條路徑。
    const D = db();
    const shortThread = {
      ...D,
      screws: D.screws.map((s) =>
        s.size === 'M6'
          ? { ...s, lengths: s.lengths.map((l) => ({ ...l, b: Math.min(l.b, 6), fullThread: false })) }
          : s,
      ),
    };
    const r = solve(inputs(), shortThread);
    const bad = r.candidates.filter((c) => c.status === 'infeasible');
    expect(bad.length).toBeGreaterThan(0);
    expect(bad[0].reasons.some((x) => /無牙段會進入攻牙孔/.test(x))).toBe(true);
  });
});

describe('邊界一律含端點，且必留 reasons', () => {
  it('E 剛好等於 E_min → recommended（不是 shallow）', () => {
    const reasons: string[] = [];
    expect(classify(ctx(), 6, 5, 20, reasons)).toBe('recommended');
    expect(reasons.some((r) => /剛好等於下限/.test(r))).toBe(true);
  });

  it('E 略低於 E_min → shallow', () => {
    expect(classify(ctx(), 5.99, 5, 20, [])).toBe('shallow');
  });

  it('餘隙剛好等於下限 → 通過，但留字', () => {
    const reasons: string[] = [];
    expect(classify(ctx(), 7.5, 1.5, 20, reasons)).toBe('recommended');
    expect(reasons.some((r) => /餘隙 1.5 已在下限/.test(r))).toBe(true);
  });

  it('餘隙略低於下限 → bottoming', () => {
    expect(classify(ctx(), 7.5, 1.49, 20, [])).toBe('bottoming');
  });

  it('浮點：0.1+0.2 的累積誤差不得讓端點判定翻轉', () => {
    const reasons: string[] = [];
    const e = 0.1 + 0.2 + 5.7; // 6.000000000000001
    expect(classify(ctx(), e, 5, 20, reasons)).toBe('recommended');
    expect(reasons.some((r) => /剛好等於下限/.test(r))).toBe(true);
  });
});

describe('判定順序不可調換', () => {
  it('螺紋不足優先於頂底：兩者同時成立時判 infeasible', () => {
    expect(classify(ctx(), 10, 0.5, 5, [])).toBe('infeasible');
  });

  it('頂底優先於過淺：餘隙不足時即使 E 也不足仍判 bottoming', () => {
    expect(classify(ctx(), 5, 1, 20, [])).toBe('bottoming');
  });
});

describe('E 超過 k_cap：無效益而非失效', () => {
  it('餘隙足夠時 status 維持 recommended 但留下警告理由', () => {
    const reasons: string[] = [];
    // kCap 1.5 × 6 = 9，E = 9.5 > 9，但 hEff 20 讓餘隙充足
    expect(classify(ctx({ hEff: 20 }), 9.5, 10.5, 20, reasons)).toBe('recommended');
    expect(reasons.some((r) => /超過 k_cap/.test(r))).toBe(true);
    expect(reasons.some((r) => /螺紋護套或壓入螺母/.test(r))).toBe(true);
  });

  it('不鏽鋼母材改用咬死版本的文字', () => {
    const reasons: string[] = [];
    classify(ctx({ hEff: 20, gallingRisk: true }), 9.5, 10.5, 20, reasons);
    expect(reasons.some((r) => /咬死機率越高/.test(r))).toBe(true);
  });
});

describe('排序是全序且決定性', () => {
  const mk = (length: number, engagement: number, status: Candidate['status']): Candidate => ({
    length,
    counterboreDepth: 9,
    counterboreDepthRequested: 9,
    engagement,
    engagementRatio: engagement / 6,
    clearance: 3,
    remainingWall: 3,
    threadLength: 18,
    status,
    reasons: [],
  });

  it('status 序優先於接近目標程度', () => {
    const sorted = sortCandidates([mk(20, 7.5, 'shallow'), mk(25, 2, 'recommended')], 7.5);
    expect(sorted.map((c) => c.length)).toEqual([25, 20]);
  });

  it('同 status 時取最接近 E_target 者', () => {
    const sorted = sortCandidates(
      [mk(30, 9, 'recommended'), mk(20, 7.5, 'recommended'), mk(25, 8, 'recommended')],
      7.5,
    );
    expect(sorted.map((c) => c.length)).toEqual([20, 25, 30]);
  });

  it('|E − target| 相同時取短者', () => {
    const sorted = sortCandidates(
      [mk(30, 8.5, 'recommended'), mk(20, 6.5, 'recommended')],
      7.5,
    );
    expect(sorted.map((c) => c.length)).toEqual([20, 30]);
  });

  it('完全相同的輸入排序穩定（不依賴引擎的 sort 實作）', () => {
    const list = [mk(20, 7.5, 'recommended'), mk(25, 7.5, 'recommended'), mk(30, 7.5, 'recommended')];
    const a = sortCandidates(list, 7.5).map((c) => c.length);
    const b = sortCandidates([...list].reverse(), 7.5).map((c) => c.length);
    expect(a).toEqual(b);
  });
});

describe('c 夾限後必須重算 E 並重新判 status', () => {
  const D = db();

  it('夾限後的 c 與 E 自洽：E = L − (t − c) − w', () => {
    const r = solve(inputs(), D);
    for (const c of r.candidates) {
      expect(c.engagement).toBeCloseTo(c.length - (12 - c.counterboreDepth) - 1.6, 2);
    }
  });

  it('c 一律落在 [c_min, c_max] 內', () => {
    const r = solve(inputs(), D);
    for (const c of r.candidates) {
      expect(c.counterboreDepth).toBeGreaterThanOrEqual(r.derivation.cMin - 1e-9);
      expect(c.counterboreDepth).toBeLessThanOrEqual(r.derivation.cMax + 1e-9);
    }
  });

  it('發生夾限時留下理由並保留原始需求值', () => {
    const r = solve(inputs(), D);
    const clamped = r.candidates.filter(
      (c) => Math.abs(c.counterboreDepth - c.counterboreDepthRequested) > 0.001,
    );
    expect(clamped.length).toBeGreaterThan(0);
    expect(clamped[0].reasons.some((x) => /已夾限至/.test(x))).toBe(true);
  });

  it('夾限把 E 推出合格區間時，status 必須跟著降級', () => {
    const D2 = db();
    // 薄板讓 c_max 很小，短螺絲的 c 需求被夾限後 E 掉到 E_min 以下
    const r = solve(inputs({ plateThickness: 9.2, washer: 'none' }), D2);
    const shallow = r.candidates.filter((c) => c.status === 'shallow');
    for (const c of shallow) {
      expect(c.engagement).toBeLessThan(r.derivation.eMin);
    }
  });
});
