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
        `上件材質沒指定，底肉厚的下限先以下件材質 ${inputs.parentMaterial} 代入。` +
        `受力面在沉孔底，會凹陷或被拉穿的是上件——上件若是鋁合金請明確指定，` +
        `否則肉厚下限會被放寬到鋼件的標準。`,
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
        `這個孔的有效牙深 ${fmt(tdr.effectiveThreadDepth)} 低於 ${inputs.parentMaterial} 的` +
        `慣例下限 ${fmt(tdr.hFloor)}（${fmt(parentMat.hFloorFactor)}d）。` +
        `工具不會改寫你填的值，但這個孔的牙強度餘裕偏低。`,
    });
  }

  // ── 4. 軸向界線 ──────────────────────────────────────────
  const rwMin = remainingWallMin(plateMat, d);
  const cMin = counterboreDepthMin(screw.kMax, washer.thickness, deltaRow.value);
  const cMax = counterboreDepthMax(inputs.plateThickness, rwMin);

  const eMin = q(pair.kMin * d);
  const eMaxByCap = q(pair.kCap * d);
  const eMaxByDepth = q(tdr.effectiveThreadDepth - td.clearanceMin);
  const eMax = Math.min(eMaxByCap, eMaxByDepth);
  const eTarget = q((eMin + eMax) / 2);
  const runout = q(screw.threadRunout.value * screw.pitch);

  const unverifiedFields = collectUnverified([
    { field: `${screw.size} 頭徑與頭高`, p: screw },
    { field: '螺紋收尾餘量', p: screw.threadRunout },
    { field: `墊圈 ${washer.key} 外徑與厚度`, p: washer },
    { field: '沉孔埋入餘量', p: deltaRow },
    { field: '沉孔徑讓隙', p: clearanceRow },
    { field: '通孔徑', p: throughRow },
    { field: '底孔徑', p: tapDrillRow },
    { field: `咬合倍數（${pair.parentMaterial} 配 ${pair.grade}）`, p: pair },
    { field: `底肉厚下限（${plateMat.key}）`, p: plateMat },
    { field: `有效牙深下限（${parentMat.key}）`, p: parentMat },
    { field: `剩餘牙深下限（${td.screwSize}）`, p: td },
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
    effectiveThreadDepth: tdr.effectiveThreadDepth,
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
    effectiveThreadDepth: round2(tdr.effectiveThreadDepth),
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
        `剩餘牙深的下限用的是保守預設值 ${fmt(td.clearanceMin)} mm，不是貴廠內規。` +
        `這個值決定螺絲底下要留多少牙不用到，請依廠內規範確認。`,
    });
  }

  if (unverifiedFields.length > 0) {
    warnings.push({
      level: 'warn',
      message:
        `有 ${unverifiedFields.length} 項算進來的數值還沒查證：` +
        unverifiedFields.map((f) => f.field).join('、') +
        '。查證完成前請不要直接把本工具的輸出畫進圖面。',
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
      threadDepthMode: tdr.mode,
      derivation,
      feasible: false,
    };
  };

  // 牙深本身不合法
  if (!gt(tdr.effectiveThreadDepth, 0)) {
    return fail(`有效牙深 ${fmt(tdr.effectiveThreadDepth)} 不是正值，這個孔沒有可用螺紋。`);
  }

  // c_min > c_max：沉頭孔埋不進去
  if (gt(cMin, cMax)) {
    const short = round2(cMin - cMax);
    return fail(
      `螺絲頭埋不進去，缺 ${fmt(short)} mm。` +
        `要埋平至少需要沉孔深 ${fmt(cMin)}` +
        `（頭高 ${fmt(screw.kMax)} ＋ 墊圈 ${fmt(washer.thickness)} ＋ 埋入餘量 ${fmt(deltaRow.value)}），` +
        `但板厚 ${fmt(inputs.plateThickness)} 扣掉底肉厚下限 ${fmt(rwMin)} 之後只剩 ${fmt(cMax)}。` +
        `可改用低頭型螺絲（v1 尚未支援）、拿掉墊圈，或把上件加厚到 ` +
        `${fmt(q(cMin + rwMin))} mm 以上。`,
    );
  }

  // E_min > E_max：牙深不足
  if (gt(eMin, eMax)) {
    const neededDepth = q(eMin + td.clearanceMin);
    const cause =
      eMaxByDepth < eMaxByCap
        ? `這個孔的有效牙深只有 ${fmt(tdr.effectiveThreadDepth)}，` +
          `扣掉要留的剩餘牙深 ${fmt(td.clearanceMin)} 之後只夠咬 ${fmt(eMaxByDepth)}`
        : `咬合倍數上限 ${fmt(pair.kCap)}d 低於下限 ${fmt(pair.kMin)}d（資料表本身矛盾）`;
    return fail(
      `這個孔咬不住：${inputs.screwSize} 配 ${inputs.grade} 鎖 ${inputs.parentMaterial}，` +
        `至少要咬合 ${fmt(eMin)}（${fmt(pair.kMin)}d），但${cause}。` +
        `有效牙深至少要 ${fmt(neededDepth)} mm。`,
    );
  }

  // ── 5. 逐標準長度 ────────────────────────────────────────
  const rows = lengthsInWindow(screw, lengthRange.lMin, lengthRange.lMax);

  if (rows.length === 0) {
    warnings.push({
      level: 'warn',
      message:
        `算出來可用的螺絲長度落在 ${fmt(lengthRange.lMin)}–${fmt(lengthRange.lMax)} mm，` +
        `但 ${screw.size} 的標準長度裡沒有一支落在這個範圍。` +
        `可以改板厚或沉孔深，把範圍挪開。`,
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
        `${tight.map((c) => c.length).join('、')} mm 這幾支的底肉厚落在下限 ` +
        `${fmt(rwMin)} ±0.5 之內，已經沒有公差空間。受力面在沉孔底，` +
        `太薄會在鎖緊的預壓力下凹陷，或是被整個拉穿。`,
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
    threadDepthMode: tdr.mode,
    derivation,
    feasible: candidates.some((c) => c.status !== 'infeasible'),
  };
}
