import { loadDatabase } from '../../src/data/loadDb';
import type { Database, Inputs } from '../../src/core/types';

/** 測試一律用真實資料庫——測一份手捏的假資料證明不了資料表是對的。 */
export function db(): Database {
  const r = loadDatabase();
  if (!r.ok) {
    throw new Error(
      '測試資料庫載入失敗：\n' +
        r.issues.map((i) => `  ${i.file} ${i.path}: ${i.message}`).join('\n'),
    );
  }
  return r.db;
}

export const baseInputs: Inputs = {
  screwSize: 'M6',
  grade: 'A2-70',
  headType: 'SHCS',
  plateThickness: 12,
  washer: 'ISO7089',
  parentMaterial: 'S45C',
  plateMaterial: 'S45C',
};

export function inputs(patch: Partial<Inputs> = {}): Inputs {
  return { ...baseInputs, ...patch };
}
