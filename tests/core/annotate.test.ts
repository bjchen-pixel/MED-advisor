import { describe, expect, it } from 'vitest';
import { solve } from '../../src/core/solve';
import { annotate, counterboreLine, formatFit, tapLine } from '../../src/core/annotate';
import { findScrew } from '../../src/core/geometry';
import { db, inputs } from './helpers';

describe('圖面標註字串', () => {
  const D = db();

  it('兩行格式：數值為主', () => {
    const i = inputs();
    const r = solve(i, D);
    const a = annotate(r, i, findScrew(D, i).pitch);
    expect(a.lines).toHaveLength(2);
    expect(a.lines[0]).toBe('Ø13 深9.1 / Ø6.6 通');
    expect(a.lines[1]).toBe('M6×1 深14 / 底孔Ø5 深18');
  });

  it('複製字串為兩行，不夾帶警告或出處註解', () => {
    const i = inputs();
    const a = annotate(solve(i, D), i, 1);
    expect(a.text).toBe(a.lines.join('\n'));
    expect(a.text).not.toMatch(/未查證|預設值|警示/);
  });

  it('模式 B 無底孔深時只出攻牙段', () => {
    const i = inputs({ tapDepth: 12 });
    const r = solve(i, D);
    const a = annotate(r, i, 1);
    expect(a.lines[1]).toBe('M6×1 深12');
    expect(a.lines[1]).not.toMatch(/底孔/);
  });

  it('沉頭孔行隨墊圈改變', () => {
    const i = inputs({ washer: 'none' });
    expect(counterboreLine(solve(i, D).geometry)).toMatch(/^Ø11 /);
  });

  it('tapLine 帶入正確螺距', () => {
    const i = inputs({ screwSize: 'M8' });
    const g = solve(i, D).geometry;
    expect(tapLine(g, 'M8', 1.25)).toMatch(/^M8×1\.25 深/);
  });
});

describe('公差欄位：上偏差在上、下偏差在下', () => {
  it('值優先樣式', () => {
    expect(formatFit(20, 0.021, 0, 'H7', 'value-first')).toBe('Ø20 +0.02/0 (H7)');
  });

  it('代號優先樣式', () => {
    expect(formatFit(20, 0.021, 0, 'H7', 'code-first')).toBe('Ø20 H7 (+0.02/0)');
  });

  it('負下偏差帶負號', () => {
    expect(formatFit(20, 0, -0.021, 'h7', 'value-first')).toBe('Ø20 0/-0.02 (h7)');
  });
});
