/**
 * 可行長度候選的產生、分類與排序。
 */

import type { Candidate, CandidateStatus, LengthRow, ScrewRow } from './types';
import { clamp, eq, fmt, gt, gte, lt, q, round2 } from './num';

export type CandidateContext = {
  t: number;
  w: number;
  d: number;
  cMin: number;
  cMax: number;
  eMin: number;
  eMax: number;
  eTarget: number;
  kCap: number;
  /** 有效牙深（滿牙深度） */
  effectiveThreadDepth: number;
  clearanceMin: number;
  /** 螺紋收尾餘量，mm */
  runout: number;
  gallingRisk: boolean;
};

/**
 * 判定順序不可調換：
 *   1  螺紋長 < 咬合 + 收尾      → infeasible   無牙段伸進攻牙孔
 *   2  剩餘牙深 < 下限           → bottoming    會吃到不完全牙（假鎖緊）
 *   3  咬合 < 下限               → shallow      咬合不足
 *   4  咬合 > 上限               → recommended ＋ 警告（沒效益，不是失效）
 *   5  否則                      → recommended
 */
export function classify(
  ctx: CandidateContext,
  e: number,
  clearance: number,
  b: number,
  reasons: string[],
): CandidateStatus {
  const needed = q(e + ctx.runout);

  if (lt(b, needed)) {
    reasons.push(
      `螺紋長 ${fmt(b)} 不夠：要咬合 ${fmt(e)} 再加螺紋收尾 ${fmt(ctx.runout)}，` +
        `至少需要 ${fmt(needed)}。螺絲的無牙段會伸進攻牙孔，咬合等於零，而圖面上看不出來`,
    );
    return 'infeasible';
  }
  reasons.push(
    `螺紋長 ${fmt(b)} 夠：咬合 ${fmt(e)} ＋ 螺紋收尾 ${fmt(ctx.runout)} ＝ ${fmt(needed)} ✓`,
  );

  if (lt(clearance, ctx.clearanceMin)) {
    reasons.push(
      `剩餘牙深 ${fmt(clearance)} 低於下限 ${fmt(ctx.clearanceMin)}：螺絲會鎖進不完全牙。` +
        `扭力被底部吃掉，扳手感覺很緊、扭力值也到了，但兩件之間沒有夾持力`,
    );
    return 'bottoming';
  }
  if (eq(clearance, ctx.clearanceMin)) {
    reasons.push(
      `剩餘牙深 ${fmt(clearance)} 剛好在下限，牙深少攻 0.1 就會鎖到底`,
    );
  }

  if (lt(e, ctx.eMin)) {
    reasons.push(
      `咬合 ${fmt(e)} 低於下限 ${fmt(ctx.eMin)}（${fmt(ctx.eMin / ctx.d)}d）：夾持力不足`,
    );
    return 'shallow';
  }
  if (eq(e, ctx.eMin)) {
    reasons.push(
      `咬合 ${fmt(e)} 剛好等於下限 ${fmt(ctx.eMin / ctx.d)}d，沒有往下的公差空間`,
    );
  }

  const cap = q(ctx.kCap * ctx.d);
  if (gt(e, cap)) {
    reasons.push(
      ctx.gallingRisk
        ? `咬合 ${fmt(e)} 超過上限 ${fmt(cap)}（${fmt(ctx.kCap)}d）：` +
            `不鏽鋼母材咬合越長，咬死（galling）機率越高，不要以「深一點比較安全」加長`
        : `咬合 ${fmt(e)} 超過上限 ${fmt(cap)}（${fmt(ctx.kCap)}d）：` +
            `螺紋受力集中在最靠接合面的前三到四牙，再深沒有強度效益。` +
            `需要更高強度應改用螺紋護套或壓入螺母`,
    );
  }

  return 'recommended';
}

/**
 * 單一標準長度的候選。
 *
 * 順序是重點：夾限 c → 用夾限後的 c 重算 E → 才分類。
 * 先分類再夾限會留下一列掛著「建議」但 E 已不合格的候選。
 */
export function buildCandidate(ctx: CandidateContext, row: LengthRow): Candidate {
  const reasons: string[] = [];

  const cReq = q(ctx.t + ctx.w + ctx.eTarget - row.l);
  const c = q(clamp(cReq, ctx.cMin, ctx.cMax));
  if (!eq(c, cReq)) {
    reasons.push(
      `沉孔深需要 ${fmt(cReq)} 才能剛好命中目標咬合 ${fmt(ctx.eTarget)}，` +
        `但可用範圍只有 ${fmt(ctx.cMin)}–${fmt(ctx.cMax)}，已取 ${fmt(c)}，咬合因此偏離目標`,
    );
  }

  const grip = q(ctx.t - c);
  const e = q(row.l - grip - ctx.w);
  const clearance = q(ctx.effectiveThreadDepth - e);

  const status = classify(ctx, e, clearance, row.b, reasons);

  if (eq(c, ctx.cMax)) {
    reasons.push(`沉孔深已到上限 ${fmt(ctx.cMax)}，底肉厚正好在下限`);
  }

  return {
    length: row.l,
    counterboreDepth: round2(c),
    counterboreDepthRequested: round2(cReq),
    engagement: round2(e),
    engagementRatio: round2(e / ctx.d),
    clearance: round2(clearance),
    remainingWall: round2(grip),
    threadLength: row.b,
    status,
    reasons,
  };
}

const STATUS_RANK: Record<CandidateStatus, number> = {
  recommended: 0,
  shallow: 1,
  bottoming: 2,
  infeasible: 3,
};

/**
 * 排序是呈現，不是選擇。
 *
 *   1  status 序
 *   2  |E − E_target| 遞增
 *   3  L 遞減 → 取短者
 *   4  L 遞增（最終決定性回退，保證全序）
 *
 * 第 4 條不可省：否則不同 JS 引擎的 Array.sort 可能給出不同順序，
 * 回歸測試會偶發紅燈，而工程師會看到「同樣的輸入，今天的第一名跟昨天不一樣」。
 */
export function sortCandidates(list: Candidate[], eTarget: number): Candidate[] {
  return [...list].sort((a, b) => {
    const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (r !== 0) return r;

    const da = Math.abs(q(a.engagement - eTarget));
    const db = Math.abs(q(b.engagement - eTarget));
    if (!eq(da, db)) return da - db;

    if (!eq(a.length, b.length)) return a.length - b.length;
    return a.length - b.length;
  });
}

/**
 * 可行長度區間。
 *   L = (t − c) + w + E，L 隨 c 遞減、隨 E 遞增
 */
export function lengthWindow(ctx: CandidateContext): { lMin: number; lMax: number } {
  return {
    lMin: q(ctx.eMin + ctx.t - ctx.cMax + ctx.w),
    lMax: q(ctx.eMax + ctx.t - ctx.cMin + ctx.w),
  };
}

/** 標準長度清單與可行區間的交集。 */
export function lengthsInWindow(screw: ScrewRow, lMin: number, lMax: number): LengthRow[] {
  return screw.lengths.filter((r) => gte(r.l, lMin) && !gt(r.l, lMax));
}
