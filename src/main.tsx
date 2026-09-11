/**
 * 進入點。
 *
 * loadDatabase() 在 React 渲染之前同步執行：成功 render <App>，失敗 render
 * <DatabaseError>。沒有「降級顯示」這個中間狀態——那正是派工單原則 4 要禁止的
 * 靜默降級，只是換了個看起來很負責的外觀。
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadDatabase } from './data/loadDb';
import { App } from './ui/App';
import { DatabaseError } from './ui/DatabaseError';
import './ui/styles.css';

const root = createRoot(document.getElementById('root')!);
const loaded = loadDatabase();

if (loaded.ok) {
  root.render(
    <StrictMode>
      <App db={loaded.db} />
    </StrictMode>,
  );
} else {
  // 同一份 issues 也印一份，方便複製回報
  console.error('[db] 資料表載入失敗', loaded.issues);
  root.render(
    <StrictMode>
      <DatabaseError issues={loaded.issues} revisions={loaded.revisions} />
    </StrictMode>,
  );
}
