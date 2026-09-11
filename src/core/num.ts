/**
 * 數值比較。
 *
 * 所有長度量先量化到 0.01 mm 再比較，而不是只放寬 epsilon。
 * 理由：0.1 + 0.2 !== 0.3 這類誤差會讓「剛好等於下限」隨機變成「差一點」，
 * 同一組輸入在不同機器上得到不同 status——這種不穩定在回歸測試裡最難查。
 */

export const QUANTUM = 0.01;
const EPS = 1e-6;

/** 量化到 0.01 mm。0.01 已遠細於加工能力。 */
export function q(x: number): number {
  return Math.round(x / QUANTUM) * QUANTUM;
}

/** 顯示用：四捨五入到 0.01 並去掉浮點尾巴。 */
export function round2(x: number): number {
  return Number(q(x).toFixed(2));
}

/** a >= b（閉區間，含端點）。 */
export function gte(a: number, b: number): boolean {
  return q(a) - q(b) > -EPS;
}

/** a <= b（閉區間，含端點）。 */
export function lte(a: number, b: number): boolean {
  return q(a) - q(b) < EPS;
}

/** a === b（量化後） */
export function eq(a: number, b: number): boolean {
  return Math.abs(q(a) - q(b)) < EPS;
}

/** a < b（嚴格） */
export function lt(a: number, b: number): boolean {
  return q(a) - q(b) < -EPS;
}

/** a > b（嚴格） */
export function gt(a: number, b: number): boolean {
  return q(a) - q(b) > EPS;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}

/** 無條件進位到 step 的整數倍。 */
export function ceilTo(x: number, step: number): number {
  return Math.ceil(q(x) / step - EPS) * step;
}

/** 格式化為字串，最多兩位小數，不留尾隨零。 */
export function fmt(x: number): string {
  return String(round2(x));
}
