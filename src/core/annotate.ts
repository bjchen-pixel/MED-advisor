/**
 * 圖面標註字串產生。
 *
 * 甲方已定案的格式偏好：數值為主，公差代號括號為輔。
 *   Ø11 深7 / Ø6.6 通
 *   M6×1.0 深16 / 底孔Ø5 深20
 *
 * 標註形式是專案層級設定，不是每孔各選——同一張圖混用兩種樣式是最容易出錯的狀態。
 */

import type { Geometry, Inputs, Result } from './types';
import { fmt } from './num';

export type ToleranceStyle = 'value-first' | 'code-first';

export type AnnotationOptions = {
  toleranceStyle: ToleranceStyle;
};

export const DEFAULT_ANNOTATION_OPTIONS: AnnotationOptions = {
  toleranceStyle: 'value-first',
};

/**
 * 配合公差欄位。上偏差在上、下偏差在下——這個順序手打極易出錯且校圖難抓，
 * 必須由程式產生。v1 只在有需要時出現。
 */
export function formatFit(
  dia: number,
  upper: number,
  lower: number,
  code: string,
  style: ToleranceStyle,
): string {
  const sign = (x: number) => (x > 0 ? `+${fmt(x)}` : x === 0 ? '0' : fmt(x));
  return style === 'value-first'
    ? `Ø${fmt(dia)} ${sign(upper)}/${sign(lower)} (${code})`
    : `Ø${fmt(dia)} ${code} (${sign(upper)}/${sign(lower)})`;
}

/** 第一行：沉頭孔 ＋ 通孔 */
export function counterboreLine(g: Geometry): string {
  return `Ø${fmt(g.counterboreDia)} 深${fmt(g.counterboreDepth)} / Ø${fmt(g.throughDia)} 通`;
}

/** 第二行：攻牙 ＋ 底孔。模式 B 無底孔深，只出攻牙段。 */
export function tapLine(g: Geometry, size: string, pitch: number): string {
  const head = `${size}×${fmt(pitch)} 深${fmt(g.tapDepth)}`;
  if (g.drillDepth === null) return head;
  return `${head} / 底孔Ø${fmt(g.tapDrillDia)} 深${fmt(g.drillDepth)}`;
}

export type Annotation = {
  lines: string[];
  /** 一鍵複製用。這是本工具唯一真正省時間的功能。 */
  text: string;
};

/**
 * 複製出的字串保持乾淨——不夾帶警告或出處註解。
 * 加註解會被貼進 CAD，比不加更糟。
 */
export function annotate(
  result: Result,
  inputs: Inputs,
  pitch: number,
  _options: AnnotationOptions = DEFAULT_ANNOTATION_OPTIONS,
): Annotation {
  const lines = [
    counterboreLine(result.geometry),
    tapLine(result.geometry, inputs.screwSize, pitch),
  ];
  return { lines, text: lines.join('\n') };
}
