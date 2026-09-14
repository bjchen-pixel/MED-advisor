#!/usr/bin/env node
/**
 * regression.csv → regression.json
 *
 * 甲方用 Excel 填 CSV，這支把它轉成測試讀的 JSON。
 * 不叫人手打 JSON：少一個逗號檔案就壞，而錯誤訊息是給程式設計師看的。
 *
 * 列舉值在這裡驗，錯誤訊息指名 CSV 第幾列。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CSV = join(here, '..', 'tests', 'fixtures', 'regression.csv');
const JSON_OUT = join(here, '..', 'tests', 'fixtures', 'regression.json');

const ENUMS = {
  螺絲規格: ['M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12'],
  等級: ['A2-70', '12.9'],
  墊圈: ['無', 'ISO7089', 'ISO7092'],
  下件材質: ['S45C', '6061-T6', 'SUS304'],
  上件材質: ['S45C', '6061-T6', 'SUS304'],
  實際使用結果: ['正常', '出過問題', '不確定'],
  狀態: ['待確認', '已確認'],
};

const WASHER_MAP = { 無: 'none', ISO7089: 'ISO7089', ISO7092: 'ISO7092' };

const REQUIRED = ['編號', '說明', '螺絲規格', '等級', '墊圈', '上件板厚', '下件材質', '實際使用結果', '狀態'];

/** 支援引號包住的欄位（備註可能含逗號）。 */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function num(v, field, line, errors) {
  // 欄位留空或表頭沒有這一欄，都視為「不檢查」——不能當成填了 NaN
  if (v === '' || v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    errors.push(`第 ${line} 列的「${field}」填了 ${JSON.stringify(v)}，不是數字`);
    return undefined;
  }
  return n;
}

function main() {
  const raw = readFileSync(CSV, 'utf8').replace(/^﻿/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = parseCsvLine(lines[0]);
  const errors = [];
  const cases = [];

  for (let i = 1; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const cells = parseCsvLine(lines[i]);
    if (cells[0].startsWith('#')) continue; // 說明列

    // 欄數不符通常是某個欄位裡有沒被引號包住的逗號。
    // 若那個欄位不是最後一欄，後面所有資料會整排錯位——必須大聲失敗，不能默默截斷。
    if (cells.length !== header.length) {
      errors.push(
        `第 ${lineNo} 列有 ${cells.length} 欄，但表頭是 ${header.length} 欄。` +
          `通常是某欄的文字裡有逗號——請用雙引號把該欄包起來，例如 "max(頭徑 10, 墊圈 12)"`,
      );
      continue;
    }

    const row = {};
    header.forEach((h, n) => { row[h] = cells[n] ?? ''; });

    for (const f of REQUIRED) {
      if (!row[f]) errors.push(`第 ${lineNo} 列缺少必填欄位「${f}」`);
    }
    for (const [field, allowed] of Object.entries(ENUMS)) {
      const v = row[field];
      if (v && !allowed.includes(v)) {
        errors.push(`第 ${lineNo} 列的「${field}」填了 ${JSON.stringify(v)}，可用值為：${allowed.join(' / ')}`);
      }
    }
    if (errors.length > 0) continue;

    const expected = {};
    const put = (k, v) => { if (v !== undefined) expected[k] = v; };
    for (const f of ['實際使用長度', '沉孔徑', '沉孔深', '通孔徑', '底孔徑']) {
      put(f, num(row[f], f, lineNo, errors));
    }

    const inputs = {
      螺絲規格: row['螺絲規格'],
      等級: row['等級'],
      墊圈: WASHER_MAP[row['墊圈']],
      上件板厚: num(row['上件板厚'], '上件板厚', lineNo, errors),
      下件材質: row['下件材質'],
    };
    if (row['上件材質']) inputs['上件材質'] = row['上件材質'];
    const depth = num(row['有效牙深'], '有效牙深', lineNo, errors);
    if (depth !== undefined) inputs['有效牙深'] = depth;

    cases.push({
      編號: row['編號'],
      說明: row['說明'],
      實際使用結果: row['實際使用結果'],
      狀態: row['狀態'],
      輸入: inputs,
      期望: expected,
      備註: row['備註'] || undefined,
    });
  }

  const ids = cases.map((c) => c.編號);
  ids.forEach((id, i) => {
    if (ids.indexOf(id) !== i) errors.push(`編號 ${id} 重複`);
  });

  if (errors.length > 0) {
    console.error('轉檔失敗，請修正 tests/fixtures/regression.csv：\n');
    for (const e of errors) console.error('  ・' + e);
    process.exit(1);
  }

  const out = {
    schemaVersion: 2,
    generatedFrom: 'regression.csv',
    generatedAt: new Date().toISOString().slice(0, 10),
    說明: '本檔由 npm run fixtures:import 產生，請勿手動編輯——改 regression.csv 再重跑。',
    cases,
  };
  writeFileSync(JSON_OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`✓ ${cases.length} 筆案例 → tests/fixtures/regression.json`);
}

main();
