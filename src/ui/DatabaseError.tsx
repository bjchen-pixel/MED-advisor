/**
 * 資料庫載入失敗的全頁阻斷畫面。
 *
 * 不渲染任何輸入欄位與計算結果。橫幅方案的失敗模式很具體：畫面上同時有紅字和
 * 看起來正常的數字，人會讀數字，而且複製按鈕仍然可以按——由損毀資料算出的標註
 * 會被貼進 CAD，然後離開這個工具的視野。本工具的產出會進入圖面，所以規則是：
 * 資料不可信時，不產出。
 *
 * 樣式全部行內寫死，不依賴任何 CSS 檔——錯誤畫面要是還依賴一堆東西才畫得出來，
 * 最需要它的時候它就不在。
 */

import type { DbIssue } from '../data/loadDb';

const S = {
  wrap: {
    maxWidth: 860,
    margin: '40px auto',
    padding: '0 20px',
    fontFamily: 'Inter, "Noto Sans TC", "Microsoft JhengHei", system-ui, sans-serif',
    color: '#1a1d21',
    lineHeight: 1.6,
  },
  head: {
    background: '#fceceb',
    border: '1px solid #e3a49e',
    borderLeft: '5px solid #8a2018',
    borderRadius: 6,
    padding: '14px 18px',
    marginBottom: 18,
  },
  h1: { fontSize: 18, margin: '0 0 4px', color: '#8a2018' },
  sub: { fontSize: 13, margin: 0, color: '#8a2018' },
  card: {
    border: '1px solid #d9dee4',
    borderRadius: 6,
    padding: '12px 16px',
    marginBottom: 10,
    background: '#fff',
  },
  file: {
    fontFamily: 'Consolas, monospace',
    fontSize: 12,
    color: '#666d77',
    marginBottom: 6,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: '3px 14px',
    fontSize: 13,
  },
  k: { color: '#666d77' },
  v: { fontFamily: 'Consolas, monospace', wordBreak: 'break-all' as const },
  foot: { fontSize: 12, color: '#666d77', marginTop: 18 },
};

export function DatabaseError({
  issues,
  revisions,
}: {
  issues: DbIssue[];
  revisions: Record<string, string>;
}) {
  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <h1 style={S.h1}>資料表載入失敗</h1>
        <p style={S.sub}>
          工具已停止，未產生任何計算結果。共 {issues.length} 個問題。
        </p>
      </div>

      {issues.map((i, n) => (
        <div key={n} style={S.card}>
          <div style={S.file}>{i.file}</div>
          <div style={S.grid}>
            <span style={S.k}>位置</span>
            <span style={S.v}>{i.path}</span>
            <span style={S.k}>預期</span>
            <span style={S.v}>{i.expected}</span>
            <span style={S.k}>實得</span>
            <span style={S.v}>{i.received}</span>
            <span style={S.k}>訊息</span>
            <span>{i.message}</span>
          </div>
        </div>
      ))}

      <div style={S.foot}>
        <div style={{ fontFamily: 'Consolas, monospace', marginBottom: 6 }}>
          資料版本　
          {Object.entries(revisions)
            .map(([k, v]) => `${k} ${v}`)
            .join('　/　')}
        </div>
        這是資料檔問題，不是操作問題。請聯絡工具維護者，並附上本畫面。
        完整問題清單也已輸出到瀏覽器 console。
      </div>
    </div>
  );
}
