/**
 * 查表與徑向／軸向幾何。純函式，不碰 DOM、網路、環境變數。
 */

import type {
  Database,
  Geometry,
  HoleFeature,
  HoleRow,
  Inputs,
  LengthRow,
  MaterialKey,
  MaterialPairRow,
  MaterialRow,
  ScrewRow,
  ThreadDepthRow,
  WasherRow,
  Verified,
  Source,
} from './types';
import { ceilTo, q } from './num';

/** 查表失敗是程式錯誤或資料缺列，一律拋出——不靜默套預設值。 */
export class LookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LookupError';
  }
}

export function findScrew(db: Database, inputs: Inputs): ScrewRow {
  const row = db.screws.find(
    (r) => r.size === inputs.screwSize && r.headType === inputs.headType,
  );
  if (!row) throw new LookupError(`screws.json 缺少 ${inputs.screwSize} ${inputs.headType} 的列`);
  return row;
}

export function findWasher(db: Database, inputs: Inputs): WasherRow {
  const row = db.washers.find(
    (r) => r.key === inputs.washer && r.screwSize === inputs.screwSize,
  );
  if (!row) throw new LookupError(`washers.json 缺少 ${inputs.washer} × ${inputs.screwSize} 的列`);
  return row;
}

export function findHole(db: Database, size: string, feature: HoleFeature): HoleRow {
  const row = db.holes.find((r) => r.screwSize === size && r.feature === feature);
  if (!row) throw new LookupError(`holes.json 缺少 ${size} 的 ${feature} 列`);
  return row;
}

export function findMaterial(db: Database, key: MaterialKey): MaterialRow {
  const row = db.materials.find((r) => r.key === key);
  if (!row) throw new LookupError(`materials.json 的 materials[] 缺少 ${key} 的列`);
  return row;
}

export function findPair(db: Database, inputs: Inputs): MaterialPairRow {
  const row = db.materialPairs.find(
    (r) => r.parentMaterial === inputs.parentMaterial && r.grade === inputs.grade,
  );
  if (!row) {
    throw new LookupError(
      `materials.json 的 pairs[] 缺少 ${inputs.parentMaterial} × ${inputs.grade} 的列`,
    );
  }
  return row;
}

export function findThreadDepth(db: Database, inputs: Inputs): ThreadDepthRow {
  const row = db.threadDepth.rows.find(
    (r) => r.screwSize === inputs.screwSize && r.holeType === 'blind',
  );
  if (!row) {
    throw new LookupError(
      `牙深規則檔（${db.threadDepth.profile}）缺少 ${inputs.screwSize} blind 的列`,
    );
  }
  return row;
}

export function findLength(screw: ScrewRow, l: number): LengthRow | undefined {
  return screw.lengths.find((r) => r.l === l);
}

// ────────────────────────────── 徑向 ──────────────────────────────

/**
 * 沉頭孔徑 = max(頭徑, 墊圈外徑) + 讓隙
 *
 * 「無墊圈」是 washers.json 裡 od=0 的真實資料列，所以這裡不需要分支。
 */
export function counterboreDia(screw: ScrewRow, washer: WasherRow, clearance: number): number {
  return q(Math.max(screw.dkMax, washer.od) + clearance);
}

// ────────────────────────────── 軸向 ──────────────────────────────

export type ThreadDepthResolution = {
  /** H */
  tapDepth: number;
  /** D。given 模式回 null。 */
  drillDepth: number | null;
  /** H_eff = H − imperfect */
  hEff: number;
  imperfect: number;
  hFloor: number;
  mode: 'derived' | 'given';
  /** given 模式下 H 低於母材慣例下限 */
  belowFloor: boolean;
};

/**
 * 攻牙深 H 的雙模式解析。兩條路徑都不循環：
 *
 *   模式 A（derived，新設計）  H 由 kCap、母材下限推出
 *   模式 B（given，現有件）    H 是已知條件，不改寫使用者量到的值
 */
export function resolveThreadDepth(
  inputs: Inputs,
  screw: ScrewRow,
  pair: MaterialPairRow,
  parentMat: MaterialRow,
  td: ThreadDepthRow,
): ThreadDepthResolution {
  const imperfect = q(td.imperfectPitches * screw.pitch);
  const hFloor = q(parentMat.hFloorFactor * screw.d);

  if (inputs.tapDepth !== undefined) {
    // 模式 B：不改寫使用者給的 H，低於慣例下限只記旗標由 solve 發 warn。
    const tapDepth = q(inputs.tapDepth);
    return {
      tapDepth,
      drillDepth: null,
      hEff: q(tapDepth - imperfect),
      imperfect,
      hFloor,
      mode: 'given',
      belowFloor: tapDepth < hFloor,
    };
  }

  const wanted = pair.kCap * screw.d + imperfect + td.clearanceMin;
  const tapDepth = q(Math.max(ceilTo(wanted, 1), hFloor));
  return {
    tapDepth,
    drillDepth: q(tapDepth + td.drillAllowance),
    hEff: q(tapDepth - imperfect),
    imperfect,
    hFloor,
    mode: 'derived',
    belowFloor: false,
  };
}

/**
 * 殘留肉厚下限 = max(factor × d, floor)
 *
 * 查的是【上件】材質——沉頭底面是受力面，凹陷或拉穿發生在上件，母材不在這條
 * 受力路徑上。上件材質未指定時以母材代入，由 solve 發 warn。
 */
export function remainingWallMin(mat: MaterialRow, d: number): number {
  return q(Math.max(mat.remainingWallFactor * d, mat.remainingWallFloor));
}

export function counterboreDepthMin(kMax: number, w: number, delta: number): number {
  return q(kMax + w + delta);
}

export function counterboreDepthMax(t: number, rwMin: number): number {
  return q(t - rwMin);
}

/** 組出 Geometry。c 由呼叫端（solve）決定，因為它取決於候選長度。 */
export function buildGeometry(
  db: Database,
  inputs: Inputs,
  screw: ScrewRow,
  washer: WasherRow,
  td: ThreadDepthResolution,
  c: number,
): Geometry {
  const clearance = findHole(db, inputs.screwSize, 'counterbore_clearance').value;
  return {
    counterboreDia: counterboreDia(screw, washer, clearance),
    counterboreDepth: q(c),
    throughDia: findHole(db, inputs.screwSize, 'through_medium').value,
    tapDrillDia: findHole(db, inputs.screwSize, 'tap_drill').value,
    tapDepth: td.tapDepth,
    drillDepth: td.drillDepth,
    remainingWall: q(inputs.plateThickness - c),
  };
}

// ────────────────────────────── 來源追溯 ──────────────────────────────

export type FieldProvenance = {
  field: string;
  verified: Verified;
  source: Source;
  sourceRef: string;
};

/** 收集參與計算且非 verified 的欄位。未查證的值不得安靜地被使用。 */
export function collectUnverified(
  entries: { field: string; p: { verified: Verified; source: Source; sourceRef: string } }[],
): FieldProvenance[] {
  return entries
    .filter((e) => e.p.verified !== 'verified')
    .map((e) => ({
      field: e.field,
      verified: e.p.verified,
      source: e.p.source,
      sourceRef: e.p.sourceRef,
    }));
}
