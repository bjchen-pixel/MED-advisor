/**
 * 剖面圖座標計算。回傳純資料，不畫——無顏色、無線寬、無 SVG 字串。
 *
 * 座標系：
 *   原點  上件上表面與孔軸的交點
 *   x     徑向，向右為正；孔軸在 x = 0
 *   y     軸向，向下為正
 *   單位  mm（模型座標即真實尺寸，不預先縮放）
 *
 * y 向下為正的理由：派工單每個軸向量（t、c、H、D、w）都是「從某個面往下量」的
 * 正值，y 向下時這些數字直接就是 y 座標，全程沒有負號。剖面圖畫錯最常見的成因
 * 就是符號翻轉。附帶好處：SVG 原生 y 也向下，view 只需縮放平移。
 */

import type { Candidate, Geometry, Inputs, ScrewRow, WasherRow } from './types';
import { q, round2 } from './num';

export type Pt = { x: number; y: number };

export type SectionRole =
  | 'plate-upper'
  | 'parent'
  | 'screw'
  | 'washer'
  | 'thread'
  | 'drill';

export type SectionPolyline = {
  id: string;
  role: SectionRole;
  points: Pt[];
  closed: boolean;
  hatch?: { angle: number; pitch: number };
};

export type SectionDim = {
  id: string;
  label: string;
  value: number;
  kind: 'axial' | 'diameter';
  from: Pt;
  to: Pt;
  offset: number;
  /** 語意，不是顏色。由 view 決定怎麼呈現。 */
  emphasis: 'normal' | 'critical';
};

export type SectionModel = {
  units: 'mm';
  /** 只回右半，左半由 view 鏡射——對稱性由結構保證，不由兩份座標的一致性保證。 */
  half: 'right';
  axisX: 0;
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number };
  polylines: SectionPolyline[];
  dims: SectionDim[];
  centerline: { from: Pt; to: Pt };
  scaleHint: { preferredPxPerMm: number; ladder: number[] };
  notes: string[];
};

export const SCALE_LADDER = [12, 8, 6, 4, 3, 2, 1.5, 1];
export const PREFERRED_PX_PER_MM = 8;

/**
 * 選比例：**只看徑向（寬度）**，不看軸向。
 *
 * 絕不放大——小東西就該看起來小。離散階梯而非連續縮放，是因為連續縮放會在每次
 * 按鍵時平滑重新正規化，把「板厚打成 1.2，圖會立刻長歪」這個訊號抹平，而那正是
 * 派工單 §3.5 要的效果。
 *
 * 只看寬度是關鍵。若把軸向也納入 fit，板厚變厚會讓比例降一階，畫布上的高度反而
 * 可能變矮——實測 t=12 在 8px/mm 下為 240px，t=40 在 4px/mm 下只有 232px。那等於
 * 又把「長歪」的訊號正規化掉了，只是換成階梯式地發生。
 *
 * 徑向尺寸只依螺絲規格與墊圈，不隨 t / H / D 改變，因此比例在整個編輯過程中穩定，
 * 板厚變化會完整反映成高度變化。軸向放不下時用裁切與折斷線處理，不降比例。
 */
export function pickScale(
  bounds: SectionModel['bounds'],
  viewW: number,
  preferred = PREFERRED_PX_PER_MM,
): number {
  const w = Math.max(bounds.xMax - bounds.xMin, 0.001);
  for (const s of SCALE_LADDER) {
    if (s > preferred) continue;
    if (w * s <= viewW) return s;
  }
  return SCALE_LADDER[SCALE_LADDER.length - 1];
}

/**
 * 軸向是否超出視窗。超出時由 view 裁切母材下段並畫折斷線，**不降比例**。
 * 裁切母材下段是安全的：頂底發生在 y = t + H_eff 附近，那一段永遠保留。
 */
export function axialOverflow(
  bounds: SectionModel['bounds'],
  pxPerMm: number,
  viewH: number,
): { overflows: boolean; visibleMm: number } {
  const h = bounds.yMax - bounds.yMin;
  const visibleMm = viewH / pxPerMm;
  return { overflows: h * pxPerMm > viewH, visibleMm: round2(visibleMm) };
}

/** 比例的顯示字串，例如 1:2。 */
export function scaleLabel(pxPerMm: number): string {
  if (pxPerMm >= 1) {
    const r = 1 / pxPerMm;
    return r === 1 ? '1:1' : `${pxPerMm}:1`;
  }
  return `1:${round2(1 / pxPerMm)}`;
}

function rect(id: string, role: SectionRole, x0: number, y0: number, x1: number, y1: number,
              hatch?: { angle: number; pitch: number }): SectionPolyline {
  return {
    id,
    role,
    points: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
    closed: true,
    hatch,
  };
}

/**
 * candidate 可為 null——尚未選定長度時仍要畫得出孔的幾何。
 * 輸入改動的即時回饋不該等到有候選才出現。
 */
export function buildSection(
  geometry: Geometry,
  candidate: Candidate | null,
  inputs: Inputs,
  screw: ScrewRow,
  washer: WasherRow,
  hEff: number,
): SectionModel {
  const t = inputs.plateThickness;
  const c = candidate ? candidate.counterboreDepth : geometry.counterboreDepth;
  const w = washer.thickness;
  const k = screw.kMax;

  const rCb = geometry.counterboreDia / 2;
  const rThrough = geometry.throughDia / 2;
  const rDrill = geometry.tapDrillDia / 2;
  const rScrew = screw.d / 2;
  const rWasher = washer.od / 2;
  const rHead = screw.dkMax / 2;

  const H = geometry.tapDepth;
  const D = geometry.drillDepth;

  const polylines: SectionPolyline[] = [];
  const dims: SectionDim[] = [];
  const notes: string[] = [];

  const bodyR = Math.max(rCb, rHead, rWasher) + Math.max(4, screw.d);
  // 尺寸線放在本體兩側，並把它們算進 outerR，避免標註被裁掉
  const dimLeft = -(bodyR + 1.5);
  const dimRight = bodyR + 1.5;
  const outerR = bodyR + 7;
  const parentBottom = t + (D ?? H + 2);

  // 上件：從 y=0 到 y=t，右半自孔壁到外緣
  polylines.push(rect('plate-cb', 'plate-upper', rCb, 0, bodyR, c, { angle: 45, pitch: 2 }));
  polylines.push(rect('plate-through', 'plate-upper', rThrough, c, bodyR, t, { angle: 45, pitch: 2 }));

  // 母材：從 y=t 往下
  polylines.push(rect('parent', 'parent', rDrill, t, bodyR, parentBottom, { angle: -45, pitch: 2 }));

  // 攻牙段與有效牙深
  polylines.push({
    id: 'thread',
    role: 'thread',
    points: [
      { x: rDrill, y: t },
      { x: rScrew, y: t },
      { x: rScrew, y: t + H },
      { x: rDrill, y: t + H },
    ],
    closed: false,
  });
  polylines.push({
    id: 'thread-eff',
    role: 'thread',
    points: [
      { x: rDrill, y: t + hEff },
      { x: rScrew, y: t + hEff },
    ],
    closed: false,
  });

  if (D !== null) {
    polylines.push({
      id: 'drill',
      role: 'drill',
      points: [
        { x: rDrill, y: t + H },
        { x: rDrill, y: t + D },
      ],
      closed: false,
    });
  } else {
    notes.push('底孔深未知（現有件模式），圖上不繪');
  }

  let yMin = 0;

  if (candidate) {
    const L = candidate.length;
    const headTop = q(c - w - k);
    const headBottom = q(c - w);
    const screwBottom = q(c - w + L);

    polylines.push(rect('washer', 'washer', rThrough, headBottom - w, rWasher, headBottom));
    polylines.push(rect('head', 'screw', 0, headTop, rHead, headBottom));
    polylines.push(rect('shank', 'screw', 0, headBottom, rScrew, screwBottom));

    yMin = Math.min(0, headTop);
    if (headTop < 0) {
      notes.push('螺絲頭突出於上件表面：沉頭孔深不足以埋入頭高＋墊圈');
    }

    dims.push({
      id: 'dim-E',
      label: 'E',
      value: candidate.engagement,
      kind: 'axial',
      from: { x: dimRight, y: t },
      to: { x: dimRight, y: screwBottom },
      offset: 0,
      emphasis: candidate.status === 'shallow' ? 'critical' : 'normal',
    });
    dims.push({
      id: 'dim-clearance',
      label: '餘隙',
      value: candidate.clearance,
      kind: 'axial',
      from: { x: dimRight, y: screwBottom },
      to: { x: dimRight, y: t + hEff },
      offset: 0,
      emphasis: candidate.status === 'bottoming' ? 'critical' : 'normal',
    });
  }

  dims.push({
    id: 'dim-c',
    label: 'c',
    value: round2(c),
    kind: 'axial',
    from: { x: dimLeft, y: 0 },
    to: { x: dimLeft, y: c },
    offset: 0,
    emphasis: 'normal',
  });
  dims.push({
    id: 'dim-G',
    label: 'G',
    value: round2(t - c),
    kind: 'axial',
    from: { x: dimLeft, y: c },
    to: { x: dimLeft, y: t },
    offset: 0,
    emphasis: 'normal',
  });
  dims.push({
    id: 'dim-cbdia',
    label: 'Ø沉頭',
    value: geometry.counterboreDia,
    kind: 'diameter',
    from: { x: 0, y: 0 },
    to: { x: rCb, y: 0 },
    offset: -12,
    emphasis: 'normal',
  });

  // bounds 描述【鏡射後的完整】範圍（polylines 仍只有右半），
  // 這樣縮放計算拿到的就是實際畫出來的寬度，不會只算到一半。
  // 尺寸線在本體之外，也必須算進去，否則標註會被裁掉。
  const bounds = {
    xMin: round2(-outerR),
    xMax: round2(outerR),
    yMin: round2(yMin),
    yMax: round2(parentBottom),
  };

  return {
    units: 'mm',
    half: 'right',
    axisX: 0,
    bounds,
    polylines,
    dims,
    centerline: { from: { x: 0, y: bounds.yMin - 2 }, to: { x: 0, y: bounds.yMax + 2 } },
    scaleHint: { preferredPxPerMm: PREFERRED_PX_PER_MM, ladder: SCALE_LADDER },
    notes,
  };
}
