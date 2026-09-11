/**
 * 資料庫載入與驗證。
 *
 * 這一層住在 src/data/，不在 src/core/——核心因此維持純函式、無 IO、
 * 不碰 bundler API。solve(inputs, db) 收到的永遠是已驗證的 Database。
 *
 * 一次驗完，不做部分搶救：就算只有 washers.json 壞掉也整組擋下。
 * 半有效的資料庫產生的是混合來源的結果，那是所有失效模式裡最難察覺的一種。
 */

import type { ZodIssue, ZodTypeAny } from 'zod';
import type { Database, ThreadDepthTable } from '../core/types';
import {
  holesFile,
  materialsFile,
  screwsFile,
  threadDepthFile,
  washersFile,
} from './schema';

import screwsRaw from './screws.json';
import washersRaw from './washers.json';
import holesRaw from './holes.json';
import materialsRaw from './materials.json';
import threadDepthDefaultRaw from './thread-depth.default.json';

export type DbIssue = {
  file: string;
  path: string;
  expected: string;
  received: string;
  message: string;
};

export type LoadResult =
  | { ok: true; db: Database }
  | { ok: false; issues: DbIssue[]; revisions: Record<string, string> };

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.length})`;
  const t = typeof value;
  if (t === 'string') return `${JSON.stringify(value)} (string)`;
  if (t === 'number' || t === 'boolean') return `${String(value)} (${t})`;
  if (t === 'undefined') return 'undefined（缺少此欄位）';
  return t;
}

function at(root: unknown, path: (string | number)[]): unknown {
  let cur: unknown = root;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

/** 路徑寫成 JSON 指標形式（rows[3].lengths[2].b），可直接在編輯器裡找到。 */
function fmtPath(path: (string | number)[]): string {
  return path.reduce<string>((acc, key) => {
    if (typeof key === 'number') return `${acc}[${key}]`;
    return acc === '' ? key : `${acc}.${key}`;
  }, '');
}

function toIssues(file: string, raw: unknown, issues: ZodIssue[]): DbIssue[] {
  return issues.map((i) => {
    const expected =
      'expected' in i && i.expected !== undefined
        ? String(i.expected)
        : 'options' in i && Array.isArray(i.options)
          ? i.options.map((o) => JSON.stringify(o)).join(' | ')
          : '見訊息';
    return {
      file,
      path: fmtPath(i.path) || '(根)',
      expected,
      received: describe(at(raw, i.path)),
      message: i.message,
    };
  });
}

function parseFile<T extends ZodTypeAny>(
  schema: T,
  raw: unknown,
  file: string,
  sink: DbIssue[],
): Zod<T> | null {
  const r = schema.safeParse(raw);
  if (r.success) return r.data as Zod<T>;
  sink.push(...toIssues(file, raw, r.error.issues));
  return null;
}

type Zod<T extends ZodTypeAny> = T['_output'];

/**
 * 探測 gitignored 的內規 overlay。
 *
 * 用 import.meta.glob 而非靜態 import：靜態 import 一個被 gitignore 的檔案，
 * 在 CI 乾淨簽出時會直接建置失敗；glob 在檔案不存在時回傳空物件。
 */
function loadInternalOverlay(): { present: boolean; raw: unknown } {
  const mods = import.meta.glob('./thread-depth.internal.json', { eager: true }) as Record<
    string,
    { default: unknown }
  >;
  const keys = Object.keys(mods);
  if (keys.length === 0) return { present: false, raw: null };
  return { present: true, raw: mods[keys[0]].default };
}

function keyOf(r: { screwSize: string; holeType: string }): string {
  return `${r.screwSize}/${r.holeType}`;
}

export function loadDatabase(): LoadResult {
  const issues: DbIssue[] = [];

  const screws = parseFile(screwsFile, screwsRaw, 'src/data/screws.json', issues);
  const washers = parseFile(washersFile, washersRaw, 'src/data/washers.json', issues);
  const holes = parseFile(holesFile, holesRaw, 'src/data/holes.json', issues);
  const materials = parseFile(materialsFile, materialsRaw, 'src/data/materials.json', issues);
  const defaultTd = parseFile(
    threadDepthFile,
    threadDepthDefaultRaw,
    'src/data/thread-depth.default.json',
    issues,
  );

  const overlay = loadInternalOverlay();
  let internalTd: ThreadDepthTable | null = null;
  if (overlay.present) {
    // overlay 驗證失敗必須阻斷，絕不退回預設值——那正是靜默降級。
    internalTd = parseFile(
      threadDepthFile,
      overlay.raw,
      'src/data/thread-depth.internal.json',
      issues,
    ) as ThreadDepthTable | null;
  }

  const revisions: Record<string, string> = {
    screws: screws?.dataRevision ?? '(載入失敗)',
    washers: washers?.dataRevision ?? '(載入失敗)',
    holes: holes?.dataRevision ?? '(載入失敗)',
    materials: materials?.dataRevision ?? '(載入失敗)',
    threadDepth: (internalTd ?? defaultTd)?.dataRevision ?? '(載入失敗)',
  };

  // 鍵集比對：overlay 必須涵蓋預設表的完整鍵集。
  // 這一條 zod 做不到——zod 驗的是單檔形狀，不是跨檔完整性。
  // 但它必須走同一個阻斷路徑，否則會退化成一行沒人看的 console warning。
  if (internalTd && defaultTd) {
    const have = new Set(internalTd.rows.map(keyOf));
    const missing = defaultTd.rows.map(keyOf).filter((k) => !have.has(k));
    if (missing.length > 0) {
      issues.push({
        file: 'src/data/thread-depth.internal.json',
        path: 'rows',
        expected: `涵蓋預設表全部 ${defaultTd.rows.length} 個鍵（screwSize/holeType）`,
        received: `缺少 ${missing.length} 個：${missing.join('、')}`,
        message:
          'overlay 為整表取代，缺格不會回退到預設值。請補齊，或移除整個 internal 檔改用預設值。',
      });
    }
    const extra = internalTd.rows.map(keyOf).filter((k) => !defaultTd.rows.some((r) => keyOf(r) === k));
    if (extra.length > 0) {
      // 多出的鍵允許——廠內可能支援更多規格。
      // eslint-disable-next-line no-console
      console.info(`[db] 內規牙深表含預設表沒有的鍵：${extra.join('、')}`);
    }
  }

  if (issues.length > 0 || !screws || !washers || !holes || !materials || !defaultTd) {
    return { ok: false, issues, revisions };
  }

  const threadDepth = (internalTd ?? defaultTd) as ThreadDepthTable;

  const dbVersion = Object.values(revisions).sort().reverse()[0];

  return {
    ok: true,
    db: {
      screws: screws.rows,
      washers: washers.rows,
      holes: holes.rows,
      materials: materials.materials,
      materialPairs: materials.pairs,
      threadDepth,
      dbVersion,
      dbVersionDetail: revisions,
    } as Database,
  };
}
