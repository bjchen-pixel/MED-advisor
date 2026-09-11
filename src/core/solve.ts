/**
 * 計算核心的進入點。純函式：solve(inputs, db) → Result。
 *
 * 計算順序（§0.7）：
 *   1  查表
 *   2  徑向
 *   3  攻牙深（雙模式）
 *   4  軸向界線
 *   5  逐標準長度
 *   6  排序、警示、標註
 */

import type { Candidate, Database, Derivation, Inputs, Result, Warning } from './types';
import { fmt, gt, lte, q, round2 } from './num';
import {
  buildGeometry,
  collectUnverified,
  counterboreDepthMax,
  counterboreDepthMin,
  findHole,
  findMaterial,
  findPair,
  findScrew,
  findThreadDepth,
  findWasher,
  remainingWallMin,
  resolveThreadDepth,
} from './geometry';
import {
  buildCandidate,
  lengthWindow,
  lengthsInWindow,
  sortCandidates,
  type CandidateContext,
} from './candidates';
import { flagWarnings } from './warnings';

export function solve(inputs: Inputs, db: Database): Result {
  const warnings: Warning[] = [];

  // ── 1. 查表 ──────────────────────────────────────────────
  const screw = findScrew(db, inputs);
  const washer = findWasher(db, inputs);
  const pair = findPair(db, inputs);
  const td = findThreadDepth(db, inputs);
  const deltaRow = findHole(db, inputs.screwSize, 'counterbore_delta');
  const clearanceRow = findHole(db, inputs.screwSize, 'counterbore_clearance');
  const throughRow = findHole(db, inputs.screwSize, 'through_medium');
  const tapDrillRow = findHole(db, inputs.screwSize, 'tap_drill');

  const parentMat = findMaterial(db, inputs.parentMaterial);

  // 殘留肉厚查【上件】材質；未指定時以母材代入並發 warn。
  const plateMaterialKey = inputs.plateMaterial ?? inputs.parentMaterial;
  const plateMaterialAssumed = inputs.plateMaterial === undefined;
  const plateMat = findMaterial(db, plateMaterialKey);
  if (plateMaterialAssumed) {
    warnings.push({
      level: 'warn',
      message:
        `上件材質未指定，殘留肉厚判準以下件材質 ${inputs.parentMaterial} 代入。` +
        `沉頭底面是受力面，凹陷與拉穿發生在上件——上件若為鋁合金請明確指定，` +
        `否則肉厚下限會被放寬到鋼件標準。`,
    });
  }

  // ── 2. 徑向 ──────────────────────────────────────────────
  const d = screw.d;

  // ── 3. 攻牙深（雙模式） ───────────────────────────────────
  const tdr = resolveThreadDepth(inputs, screw, pair, parentMat, td);
  if (tdr.mode === 'given' && tdr.belowFloor) {
    warnings.push({
      level: 'warn',
      message:
        `現有孔牙深 H=${fmt(tdr.tapDepth)} 低於 ${inputs.parentMaterial} 的慣例下限 ` +
        `${fmt(tdr.hFloor)}（${fmt(parentMat.hFloorFactor)}d）。工具不會改寫你量到的值，` +
        `但這個孔的牙強度餘裕偏低。`,
    });
  }

  // ── 4. 軸向界線 ──────────────────────────────────────────
  const rwMin = remainingWallMin(plateMat, d);
  const cMin = counterboreDepthMin(screw.kMax, washer.thickness, deltaRow.value);
  const cMax = counterboreDepthMax(inputs.plateThickness, rwMin);

  const eMin = q(pair.kMin * d);
  const eMaxByCap = q(pair.kCap * d);
  const eMaxByDepth = q(tdr.hEff - td.clearanceMin);
  const eMax = Math.min(eMaxByCap, eMaxByDepth);
  const eTarget = q((eMin + eMax) / 2);
  const runout = q(screw.threadRunout.value * screw.pitch);

  const unverifiedFields = collectUnverified([
    { field: `螺絲 ${screw.size} 頭徑/頭高`, p: screw },
    { field: '螺紋收尾餘量 runout', p: screw.threadRunout },
    { field: `墊圈 ${washer.key}`, p: washer },
    { field: '埋入餘量 δ', p: deltaRow },
    { field: '沉頭孔徑讓隙', p: clearanceRow },
    { field: '通孔徑', p: throughRow },
    { field: '底孔徑', p: tapDrillRow },
    { field: `嵌入係數 ${pair.parentMaterial}×${pair.grade}`, p: pair },
    { field: `殘留肉厚下限 ${plateMat.key}`, p: plateMat },
    { field: `攻牙深下限 ${parentMat.key}`, p: parentMat },
    { field: `牙深規則 ${td.screwSize}`, p: td },
  ]);

  const ctx: CandidateContext = {
    t: inputs.plateThickness,
    w: washer.thickness,
    d,
    cMin,
    cMax,
    eMin,
    eMax,
    eTarget,
    kCap: pair.kCap,
    hEff: tdr.hEff,
    clearanceMin: td.clearanceMin,
    runout,
    gallingRisk: pair.flags.includes('galling-risk'),
  };

  const lengthRange = lengthWindow(ctx);

  const derivation: Derivation = {
    d,
    pitch: screw.pitch,
    kMax: screw.kMax,
    washerThickness: washer.thickness,
    washerOd: washer.od,
    delta: deltaRow.value,
    counterboreClearance: clearanceRow.value,
    cMin: round2(cMin),
    cMax: round2(cMax),
    remainingWallMin: round2(rwMin),
    remainingWallFactor: plateMat.remainingWallFactor,
    remainingWallFloor: plateMat.remainingWallFloor,
    remainingWallMaterial: plateMaterialKey,
    remainingWallMaterialAssumed: plateMaterialAssumed,
    kMin: pair.kMin,
    kCap: pair.kCap,
    kRationale: pair.rationale,
    eMin: round2(eMin),
    eMax: round2(eMax),
    eTarget: round2(eTarget),
    imperfect: round2(tdr.imperfect),
    imperfectPitches: td.imperfectPitches,
    hEff: round2(tdr.hEff),
    hFloor: round2(tdr.hFloor),
    clearanceMin: td.clearanceMin,
    threadRunout: round2(runout),
    threadRunoutPitches: screw.threadRunout.value,
    lMin: round2(lengthRange.lMin),
    lMax: round2(lengthRange.lMax),
    unverifiedFields,
  };

  // 牙深規則來源。用預設值必須是 warn 級，否則會落在 info 而永遠不顯示
  // （派工單 §3.6 規定警示帶只在 warn/error 時出現）。
  if (db.threadDepth.kind === 'default') {
    warnings.push({
      level: 'warn',
      message:
        `牙深規則使用保守預設值，非貴廠內規。H_eff 由 H 扣 ` +
        `${fmt(td.imperfectPitches)}×pitch = ${fmt(tdr.imperfect)} 推得，` +
        `實際值請依廠內絲攻與底孔規範確認。`,
    });
  }

  if (unverifiedFields.length > 0) {
    warnings.push({
      level: 'warn',
      message:
        `有 ${unverifiedFields.length} 項參與計算的數值尚未查證：` +
        unverifiedFields.map((f) => f.field).join('、') +
        '。查證完成前請勿直接採用本工具的輸出。',
    });
  }

  warnings.push(...flagWarnings(pair.flags));

  const baseGeometry = buildGeometry(db, inputs, screw, washer, tdr, cMin);

  const fail = (message: string): Result => {
    warnings.push({ level: 'error', message });
    return {
      geometry: baseGeometry,
      candidates: [],
      warnings,
      dbVersion: db.dbVersion,
      dbVersionDetail: db.dbVersionDetail,
      threadDepthSource: db.threadDepth.kind,
      tapDepthMode: tdr.mode,
      derivation,
      feasible: false,
    };
  };

  // 牙深本身不合法
  if (!gt(tdr.hEff, 0)) {
    return fail(
      `有效牙深 H_eff=${fmt(tdr.hEff)} ≤ 0：給定的攻牙深 H=${fmt(tdr.tapDepth)} ` +
        `比不完全牙 ${fmt(tdr.imperfect)} 還淺，這個孔沒有可用螺紋。`,
    );
  }

  // c_min > c_max：沉頭孔埋不進去
  if (gt(cMin, cMax)) {
    const short = round2(cMin - cMax);
    return fail(
      `沉頭孔埋不進去：所需深度 c_min=${fmt(cMin)}` +
        `（頭高 ${fmt(screw.kMax)} + 墊圈 ${fmt(washer.thickness)} + δ ${fmt(deltaRow.value)}）` +
        `超過可用深度 c_max=${fmt(cMax)}` +
        `（板厚 ${fmt(inputs.plateThickness)} − 殘留肉厚下限 ${fmt(rwMin)}），缺 ${fmt(short)} mm。` +
        `建議改用低頭型（FHCS/BHCS，v1 未支援）、去掉墊圈，或把上件加厚到 ` +
        `${fmt(q(cMin + rwMin))} mm 以上。`,
    );
  }

  // E_min > E_max：牙深不足
  if (gt(eMin, eMax)) {
    const neededHEff = q(eMin + td.clearanceMin);
    const neededH = q(neededHEff + tdr.imperfect);
    const cause =
      eMaxByDepth < eMaxByCap
        ? `有效牙深不足（H_eff=${fmt(tdr.hEff)}，扣掉餘隙下限 ${fmt(td.clearanceMin)} ` +
          `後只剩 ${fmt(eMaxByDepth)} 可用）`
        : `嵌入上限 k_cap=${fmt(pair.kCap)}d 低於下限 k_min=${fmt(pair.kMin)}d（資料表矛盾）`;
    return fail(
      `此孔無可行嵌入量：需要 E ≥ ${fmt(eMin)}（${fmt(pair.kMin)}d），但${cause}。` +
        `${inputs.screwSize} 配 ${inputs.grade} 於 ${inputs.parentMaterial} 至少需 ` +
        `H ≥ ${fmt(neededH)} mm。`,
    );
  }

  // ── 5. 逐標準長度 ────────────────────────────────────────
  const rows = lengthsInWindow(screw, lengthRange.lMin, lengthRange.lMax);

  if (rows.length === 0) {
    warnings.push({
      level: 'warn',
      message:
        `可行長度區間為 ${fmt(lengthRange.lMin)}–${fmt(lengthRange.lMax)} mm，` +
        `${screw.size} 的標準長度清單在此範圍內沒有任何長度。` +
        `可調整板厚或沉頭孔深以移動區間。`,
    });
  }

  const candidates: Candidate[] = sortCandidates(
    rows.map((r) => buildCandidate(ctx, r)),
    eTarget,
  );

  // 殘留肉厚落在下限 ±0.5 內（派工單 §3.3 第三條警示）
  const tight = candidates.filter(
    (c) => c.status !== 'infeasible' && lte(Math.abs(c.remainingWall - rwMin), 0.5),
  );
  if (tight.length > 0) {
    warnings.push({
      level: 'warn',
      message:
        `長度 ${tight.map((c) => c.length).join('、')} mm 的殘留肉厚落在下限 ` +
        `${fmt(rwMin)} ±0.5 內，已無公差空間。沉頭底面是受力面，過薄會在預壓力下凹陷或拉穿。`,
    });
  }

  const best = candidates.find((c) => c.status === 'recommended') ?? candidates[0];
  const geometry = buildGeometry(
    db,
    inputs,
    screw,
    washer,
    tdr,
    best ? best.counterboreDepth : cMin,
  );

  return {
    geometry,
    candidates,
    warnings,
    dbVersion: db.dbVersion,
    dbVersionDetail: db.dbVersionDetail,
    threadDepthSource: db.threadDepth.kind,
    tapDepthMode: tdr.mode,
    derivation,
    feasible: candidates.some((c) => c.status !== 'infeasible'),
  };
}
