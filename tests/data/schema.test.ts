/**
 * 建置期的資料檔驗證。
 *
 * 壞掉的資料檔在 CI 就紅燈，根本到不了 Pages。
 * 執行期的全頁阻斷是最後防線，不是唯一防線。
 */

import { describe, expect, it } from 'vitest';
import { loadDatabase } from '../../src/data/loadDb';
import { screwsFile, threadDepthFile } from '../../src/data/schema';
import screwsRaw from '../../src/data/screws.json';
import threadDepthRaw from '../../src/data/thread-depth.default.json';

describe('隨附資料檔全部通過 schema', () => {
  it('loadDatabase 成功', () => {
    const r = loadDatabase();
    if (!r.ok) {
      throw new Error(
        r.issues.map((i) => `${i.file} ${i.path}: ${i.message}（實得 ${i.received}）`).join('\n'),
      );
    }
    expect(r.ok).toBe(true);
  });

  it('五張表都有鍵齊全的列', () => {
    const r = loadDatabase();
    if (!r.ok) throw new Error('載入失敗');
    const sizes = ['M3', 'M4', 'M5', 'M6', 'M8'];
    for (const s of sizes) {
      expect(r.db.screws.some((x) => x.size === s), `screws ${s}`).toBe(true);
      expect(r.db.threadDepth.rows.some((x) => x.screwSize === s), `threadDepth ${s}`).toBe(true);
      for (const w of ['none', 'ISO7089', 'ISO7092']) {
        expect(r.db.washers.some((x) => x.key === w && x.screwSize === s), `washer ${w} ${s}`).toBe(true);
      }
      for (const f of ['through_medium', 'tap_drill', 'counterbore_clearance', 'counterbore_delta']) {
        expect(r.db.holes.some((x) => x.screwSize === s && x.feature === f), `hole ${f} ${s}`).toBe(true);
      }
    }
    expect(r.db.materialPairs).toHaveLength(6);
    expect(r.db.materials).toHaveLength(3);
  });

  it('dbVersion 取五表最新者，且帶逐表對照', () => {
    const r = loadDatabase();
    if (!r.ok) throw new Error('載入失敗');
    expect(r.db.dbVersion).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    expect(Object.keys(r.db.dbVersionDetail)).toHaveLength(5);
  });

  it('未放內規 overlay 時，牙深來源為 default', () => {
    const r = loadDatabase();
    if (!r.ok) throw new Error('載入失敗');
    expect(r.db.threadDepth.kind).toBe('default');
  });
});

describe('破壞欄位型別 → 明確錯誤，不靜默降級（派工單 §5 驗收項）', () => {
  it('b 寫成字串時指出路徑、預期型別與實得值', () => {
    const broken = structuredClone(screwsRaw) as Record<string, unknown>;
    // rows[3] = M6，lengths[2] = l:12
    (broken.rows as Record<string, unknown>[])[3].lengths = (
      (broken.rows as Record<string, unknown>[])[3].lengths as Record<string, unknown>[]
    ).map((l, i) => (i === 2 ? { ...l, b: '12' } : l));

    const r = screwsFile.safeParse(broken);
    expect(r.success).toBe(false);
    if (r.success) return;
    const issue = r.error.issues.find((i) => i.path.join('.').includes('lengths.2.b'));
    expect(issue).toBeDefined();
    expect(issue!.message).toMatch(/number/i);
  });

  it('未知的 source 值被拒絕（不是靜默忽略）', () => {
    const broken = structuredClone(screwsRaw) as Record<string, unknown>;
    (broken.rows as Record<string, unknown>[])[0].source = 'ISO4762';
    expect(screwsFile.safeParse(broken).success).toBe(false);
  });

  it('sourceRef 為空字串被拒絕', () => {
    const broken = structuredClone(screwsRaw) as Record<string, unknown>;
    (broken.rows as Record<string, unknown>[])[0].sourceRef = '';
    const r = screwsFile.safeParse(broken);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/sourceRef 不得為空/);
  });

  it('多餘欄位被拒絕（strict）——打錯欄位名不會被當成新欄位默默吃掉', () => {
    const broken = structuredClone(screwsRaw) as Record<string, unknown>;
    (broken.rows as Record<string, unknown>[])[0].dkmax = 5.5;
    expect(screwsFile.safeParse(broken).success).toBe(false);
  });

  it('長度清單重複或未遞增被拒絕', () => {
    const broken = structuredClone(screwsRaw) as Record<string, unknown>;
    const row = (broken.rows as Record<string, unknown>[])[3];
    const ls = row.lengths as Record<string, unknown>[];
    row.lengths = [ls[0], ls[0], ...ls.slice(1)];
    const r = screwsFile.safeParse(broken);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => /嚴格遞增且唯一/.test(i.message))).toBe(true);
  });

  it('標為全牙但 b ≠ l 被拒絕', () => {
    const broken = structuredClone(screwsRaw) as Record<string, unknown>;
    const row = (broken.rows as Record<string, unknown>[])[3];
    const ls = row.lengths as Record<string, unknown>[];
    row.lengths = ls.map((l, i) => (i === 0 ? { ...l, b: 4 } : l));
    const r = screwsFile.safeParse(broken);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => /標為全牙但/.test(i.message))).toBe(true);
  });

  it('dataRevision 格式錯誤被拒絕', () => {
    const broken = structuredClone(screwsRaw) as Record<string, unknown>;
    broken.dataRevision = '2026-09-11';
    const r = screwsFile.safeParse(broken);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/YYYY-MM-DD\.n/);
  });

  it('kind 只接受 default / internal（身分由資料宣告，不由檔名推斷）', () => {
    const broken = structuredClone(threadDepthRaw) as Record<string, unknown>;
    broken.kind = 'factory';
    expect(threadDepthFile.safeParse(broken).success).toBe(false);
  });
});

describe('核心純度（派工單 §5 驗收項）', () => {
  it('src/core 不得出現 DOM / fetch / import.meta / bundler API', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(process.cwd(), 'src', 'core');
    const banned = [
      /\bdocument\./,
      /\bwindow\./,
      /\bnavigator\./,
      /\blocalStorage\b/,
      /\bfetch\s*\(/,
      /import\.meta/,
      /process\.env/,
    ];
    // 註解裡提到這些 API 是合法的（說明為什麼不能用），只檢查實際程式碼
    const stripComments = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const src = stripComments(readFileSync(join(dir, f), 'utf8'));
      for (const re of banned) {
        expect(re.test(src), `${f} 出現 ${re}`).toBe(false);
      }
    }
  });

  it('src/core 不得 import src/data 或 src/ui', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(process.cwd(), 'src', 'core');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(/from\s+['"][^'"]*\/(data|ui)\//.test(src), `${f}`).toBe(false);
    }
  });
});
