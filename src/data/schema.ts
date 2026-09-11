/**
 * zod schema。驗證不過就大聲失敗，不靜默套預設值。
 */

import { z } from 'zod';

export const screwSize = z.enum(['M3', 'M4', 'M5', 'M6', 'M8']);
export const grade = z.enum(['A2-70', '12.9']);
export const materialKey = z.enum(['S45C', '6061-T6', 'SUS304']);
export const washerKey = z.enum(['none', 'ISO7089', 'ISO7092']);
export const headType = z.enum(['SHCS']);

export const source = z.enum([
  'ISO 4762',
  'ISO 7089',
  'ISO 7092',
  'ISO 273',
  '供應商目錄',
  '內規',
  '工具內建',
]);

export const verified = z.enum(['verified', 'single-source', 'unverified', 'conflict']);

/** sourceRef 不得為空字串——做不到可複查精度的來源，不採用。 */
const provenance = {
  source,
  sourceRef: z.string().min(1, 'sourceRef 不得為空'),
  verified,
  note: z.string().optional(),
};

const sourced = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ value, ...provenance }).strict();

const fileHeader = {
  schemaVersion: z.number().int().positive(),
  dataRevision: z.string().regex(/^\d{4}-\d{2}-\d{2}\.\d+$/, 'dataRevision 格式須為 YYYY-MM-DD.n'),
  note: z.string().optional(),
};

// ────────────────────────────── screws ──────────────────────────────

export const lengthRow = z
  .object({
    l: z.number().positive(),
    b: z.number().positive(),
    fullThread: z.boolean(),
    ...provenance,
  })
  .strict();

export const screwRow = z
  .object({
    size: screwSize,
    headType,
    d: z.number().positive(),
    pitch: z.number().positive(),
    dkMax: z.number().positive(),
    kMax: z.number().positive(),
    threadRunout: sourced(z.number().nonnegative()),
    lengths: z.array(lengthRow).min(1),
    ...provenance,
  })
  .strict()
  .superRefine((row, ctx) => {
    // 重複長度會讓候選清單出現兩列一模一樣的建議
    for (let i = 1; i < row.lengths.length; i += 1) {
      if (row.lengths[i].l <= row.lengths[i - 1].l) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lengths', i, 'l'],
          message: `${row.size} 的長度清單必須嚴格遞增且唯一（${row.lengths[i - 1].l} → ${row.lengths[i].l}）`,
        });
      }
    }
    // b 不可超過 l
    row.lengths.forEach((lr, i) => {
      if (lr.b > lr.l) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lengths', i, 'b'],
          message: `${row.size}×${lr.l} 的螺紋長 b=${lr.b} 超過總長 l=${lr.l}`,
        });
      }
      if (lr.fullThread && lr.b !== lr.l) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lengths', i, 'fullThread'],
          message: `${row.size}×${lr.l} 標為全牙但 b=${lr.b} ≠ l=${lr.l}`,
        });
      }
    });
  });

export const screwsFile = z.object({ ...fileHeader, rows: z.array(screwRow).min(1) }).strict();

// ────────────────────────────── washers ──────────────────────────────

export const washerRow = z
  .object({
    key: washerKey,
    screwSize,
    od: z.number().nonnegative(),
    id: z.number().nonnegative(),
    thickness: z.number().nonnegative(),
    ...provenance,
  })
  .strict();

export const washersFile = z.object({ ...fileHeader, rows: z.array(washerRow).min(1) }).strict();

// ────────────────────────────── holes ──────────────────────────────

export const holeFeature = z.enum([
  'through_fine',
  'through_medium',
  'through_coarse',
  'tap_drill',
  'counterbore_clearance',
  'counterbore_delta',
]);

export const holeRow = z
  .object({
    screwSize,
    feature: holeFeature,
    value: z.number().nonnegative(),
    unit: z.literal('mm'),
    threadEngagementPercent: z.number().positive().optional(),
    appliesTo: z.string().optional(),
    ...provenance,
  })
  .strict();

export const holesFile = z.object({ ...fileHeader, rows: z.array(holeRow).min(1) }).strict();

// ────────────────────────────── materials ──────────────────────────────

export const materialRow = z
  .object({
    key: materialKey,
    remainingWallFactor: z.number().positive(),
    remainingWallFloor: z.number().positive(),
    hFloorFactor: z.number().positive(),
    ...provenance,
  })
  .strict();

export const materialPairRow = z
  .object({
    parentMaterial: materialKey,
    grade,
    kMin: z.number().positive(),
    kCap: z.number().positive(),
    flags: z.array(z.string()),
    rationale: z.string().min(1),
    ...provenance,
  })
  .strict()
  .refine((r) => r.kCap >= r.kMin, {
    message: 'kCap 不得小於 kMin',
    path: ['kCap'],
  });

export const materialsFile = z
  .object({
    ...fileHeader,
    materials: z.array(materialRow).min(1),
    pairs: z.array(materialPairRow).min(1),
  })
  .strict();

// ────────────────────────────── thread depth ──────────────────────────────

export const threadDepthRow = z
  .object({
    screwSize,
    holeType: z.literal('blind'),
    imperfectPitches: z.number().nonnegative(),
    clearanceMin: z.number().nonnegative(),
    drillAllowance: z.number().nonnegative(),
    ...provenance,
  })
  .strict();

export const threadDepthFile = z
  .object({
    ...fileHeader,
    profile: z.string().min(1),
    /** 由檔案內容宣告，不由檔名推斷。 */
    kind: z.enum(['default', 'internal']),
    label: z.string().min(1),
    rows: z.array(threadDepthRow).min(1),
  })
  .strict();

export type ScrewsFile = z.infer<typeof screwsFile>;
export type WashersFile = z.infer<typeof washersFile>;
export type HolesFile = z.infer<typeof holesFile>;
export type MaterialsFile = z.infer<typeof materialsFile>;
export type ThreadDepthFile = z.infer<typeof threadDepthFile>;
