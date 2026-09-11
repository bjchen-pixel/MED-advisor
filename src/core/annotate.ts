/**
 * 圖面標註字串產生。
 *
 * 格式：數值為主，公差代號括號為輔。
 *   Ø11 深7 / Ø6.6 通
 *   M6×1.0 有效牙深16
 *
 * 第二行寫明「有效牙深」而非只寫「深」，是甲方定案的選擇：不依賴讀圖慣例。
 * 標註有效牙深而非總攻牙深，是因為總攻牙深扣掉不完全牙等於多少，完全取決於加工端
 * 用初攻、中攻、底攻還是螺旋槽——標總深等於把設計端控制不了的變數攬到自己身上。
 * 規範結果，不規範方法。
 *
 * 底孔徑與底孔深不進標註：加工端自行決定鑽多深。
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

/** 第二行：螺紋與有效牙深。 */
export function tapLine(g: Geometry, size: string, pitch: number): string {
  return `${size}×${fmt(pitch)} 有效牙深${fmt(g.effectiveThreadDepth)}`;
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
