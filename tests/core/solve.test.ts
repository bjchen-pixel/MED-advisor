import { describe, expect, it } from 'vitest';
import { solve } from '../../src/core/solve';
import { db, inputs } from './helpers';

describe('12.9 + 6061-T6 觸發警示（派工單 §5 驗收項）', () => {
  const D = db();

  it('產生 parent-thread-weaker 警示，內容含降級建議與扭矩規範', () => {
    const r = solve(inputs({ grade: '12.9', parentMaterial: '6061-T6' }), D);
    const w = r.warnings.find((x) => x.message.includes('會先崩牙'));
    expect(w).toBeDefined();
    expect(w!.level).toBe('warn');
    expect(w!.message).toMatch(/A2-70/);
    expect(w!.message).toMatch(/2\.5d/);
    expect(w!.message).toMatch(/鎖付扭力/);
  });

  it('A2-70 + S45C 不觸發該警示', () => {
    const r = solve(inputs(), D);
    expect(r.warnings.some((x) => x.message.includes('會先崩牙'))).toBe(false);
  });
});

describe('SUS304 母材觸發 anti-seize 警示', () => {
  const D = db();

  it('兩個等級都觸發，且明示不要加長咬合', () => {
    for (const grade of ['A2-70', '12.9'] as const) {
      const r = solve(inputs({ parentMaterial: 'SUS304', grade }), D);
      const w = r.warnings.find((x) => x.message.includes('galling'));
      expect(w, grade).toBeDefined();
      expect(w!.message).toMatch(/anti-seize/);
      expect(w!.message).toMatch(/咬合越長，咬死的機率越高/);
    }
  });
});

describe('c_min > c_max 回 infeasible 並帶可讀理由（派工單 §5 驗收項）', () => {
  const D = db();

  it('M8 配 ISO7089 埋不進 6 mm 板', () => {
    const r = solve(
      inputs({ screwSize: 'M8', plateThickness: 6, washer: 'ISO7089', plateMaterial: 'S45C' }),
      D,
    );
    expect(r.feasible).toBe(false);
    expect(r.candidates).toEqual([]); // 不輸出不合法的建議值

    const e = r.warnings.find((w) => w.level === 'error');
    expect(e).toBeDefined();
    // c_min = 8 + 1.6 + 1.0 = 10.6；c_max = 6 − 2.4 = 3.6；缺 7 mm
    expect(e!.message).toMatch(/10\.6/);
    expect(e!.message).toMatch(/3\.6/);
    expect(e!.message).toMatch(/缺 7 mm/);
    expect(e!.message).toMatch(/加厚到 13 mm 以上/);
    expect(e!.message).toMatch(/螺絲頭埋不進去/);
  });

  it('理由必須說明怎麼修，不只說不行', () => {
    const r = solve(inputs({ screwSize: 'M8', plateThickness: 6, washer: 'ISO7089' }), D);
    const e = r.warnings.find((w) => w.level === 'error')!;
    expect(e.message).toMatch(/低頭型|拿掉墊圈|加厚/);
  });
});

describe('牙深不夠（現有件模式的主要輸出）', () => {
  const D = db();

  it('現有孔咬不住時，說清楚差多少、至少要多深', () => {
    // M6 + 12.9 + 6061-T6：咬合下限 2.0d = 12；有效牙深 10 扣剩餘牙深 1.5 只夠咬 8.5
    const r = solve(
      inputs({
        grade: '12.9',
        parentMaterial: '6061-T6',
        plateMaterial: '6061-T6',
        effectiveThreadDepth: 10,
      }),
      D,
    );
    expect(r.feasible).toBe(false);
    const e = r.warnings.find((w) => w.level === 'error')!;
    expect(e.message).toMatch(/這個孔咬不住/);
    expect(e.message).toMatch(/只夠咬 8\.5/);
    expect(e.message).toMatch(/有效牙深至少要 13\.5 mm/); // 12 + 1.5
  });
});

describe('標準長度無交集：是 warn 不是 error', () => {
  const D = db();

  it('寫出算出來的區間讓人知道是差多少，而不是工具壞了', () => {
    // 隨附資料表的長度清單夠密，區間必有交集；抽掉區間內的長度才驗得到這條分支。
    const sparse = {
      ...D,
      screws: D.screws.map((s) =>
        s.size === 'M6' ? { ...s, lengths: s.lengths.filter((l) => l.l >= 30) } : s,
      ),
    };
    const r = solve(inputs(), sparse);
    expect(r.candidates).toEqual([]);
    const w = r.warnings.find((x) => x.message.includes('可用的螺絲長度'));
    expect(w).toBeDefined();
    expect(w!.level).toBe('warn'); // 非錯誤：幾何合法，只是沒有現成長度
    expect(w!.message).toMatch(/9\.6–14\.5 mm/);
  });
});

describe('上件材質：未指定時以母材代入並發 warn', () => {
  const D = db();

  it('未指定 → warn，且說明受力面在上件', () => {
    const r = solve(inputs({ plateMaterial: undefined }), D);
    const w = r.warnings.find((x) => x.message.includes('上件材質沒指定'));
    expect(w).toBeDefined();
    expect(w!.level).toBe('warn');
    expect(w!.message).toMatch(/受力面在沉孔底/);
    expect(r.derivation.remainingWallMaterialAssumed).toBe(true);
  });

  it('明確指定 → 無此 warn', () => {
    const r = solve(inputs({ plateMaterial: 'S45C' }), D);
    expect(r.warnings.some((x) => x.message.includes('上件材質沒指定'))).toBe(false);
    expect(r.derivation.remainingWallMaterialAssumed).toBe(false);
  });

  it('鋁蓋鎖鋼座：上件材質改變底肉厚下限（2.0 → 3.0）', () => {
    const steel = solve(inputs({ parentMaterial: 'S45C', plateMaterial: 'S45C' }), D);
    const alu = solve(inputs({ parentMaterial: 'S45C', plateMaterial: '6061-T6' }), D);
    expect(steel.derivation.remainingWallMin).toBe(2);
    expect(alu.derivation.remainingWallMin).toBe(3);
    expect(alu.derivation.cMax).toBeLessThan(steel.derivation.cMax);
  });
});

describe('牙深來源與資料版本', () => {
  const D = db();

  it('用預設值時 threadDepthSource = default 且發 warn（否則落在 info 永遠不顯示）', () => {
    const r = solve(inputs(), D);
    expect(r.threadDepthSource).toBe('default');
    const w = r.warnings.find((x) => x.message.includes('保守預設值'));
    expect(w).toBeDefined();
    expect(w!.level).toBe('warn');
  });

  it('未查證的值會逐項列出，不安靜通過', () => {
    const r = solve(inputs(), D);
    expect(r.derivation.unverifiedFields.length).toBeGreaterThan(0);
    const w = r.warnings.find((x) => x.message.includes('還沒查證'));
    expect(w).toBeDefined();
    expect(w!.level).toBe('warn');
  });

  it('回傳 dbVersion 與逐表對照', () => {
    const r = solve(inputs(), D);
    expect(r.dbVersion).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    expect(Object.keys(r.dbVersionDetail).sort()).toEqual([
      'holes',
      'materials',
      'screws',
      'threadDepth',
      'washers',
    ]);
  });
});

describe('推導值完整可追溯（展開層的資料來源）', () => {
  const D = db();

  it('derivation 帶齊咬合倍數出處、埋入餘量、有效牙深、螺紋收尾', () => {
    const d = solve(inputs(), D).derivation;
    expect(d.kMin).toBe(1);
    expect(d.kCap).toBe(1.5);
    expect(d.kRationale).toMatch(/會先斷螺絲/);
    expect(d.delta).toBe(0.5);
    expect(d.effectiveThreadDepth).toBe(11);
    expect(d.threadRunout).toBe(1);
    expect(d.remainingWallMaterial).toBe('S45C');
  });

  it('可行長度區間與實際候選一致', () => {
    const r = solve(inputs(), D);
    for (const c of r.candidates) {
      expect(c.length).toBeGreaterThanOrEqual(r.derivation.lMin);
      expect(c.length).toBeLessThanOrEqual(r.derivation.lMax);
    }
  });
});

describe('基準案例：M6 / A2-70 / S45C / t=12 / ISO7089', () => {
  const D = db();
  const r = solve(inputs(), D);

  it('幾何與手算一致', () => {
    expect(r.geometry.counterboreDia).toBe(13);
    expect(r.geometry.throughDia).toBe(6.6);
    expect(r.geometry.tapDrillDia).toBe(5);
    expect(r.geometry.effectiveThreadDepth).toBe(11);
  });

  it('界線與手算一致', () => {
    expect(r.derivation.cMin).toBe(8.1); // 6 + 1.6 + 0.5
    expect(r.derivation.cMax).toBe(10); // 12 − 2.0
    expect(r.derivation.eMin).toBe(6); // 1.0 × 6
    expect(r.derivation.eMax).toBe(9); // min(1.5×6 = 9, 11 − 1.5 = 9.5)
    expect(r.derivation.eTarget).toBe(7.5);
    expect(r.derivation.lMin).toBe(9.6); // 6 + 12 − 10 + 1.6
    expect(r.derivation.lMax).toBe(14.5); // 9 + 12 − 8.1 + 1.6
  });

  it('L=12 命中目標 E=7.5，判建議', () => {
    const c = r.candidates.find((x) => x.length === 12)!;
    expect(c.counterboreDepth).toBe(9.1);
    expect(c.engagement).toBe(7.5);
    expect(c.clearance).toBe(3.5);
    expect(c.status).toBe('recommended');
  });

  it('排序把最接近目標者放第一', () => {
    expect(r.candidates[0].length).toBe(12);
  });
});
