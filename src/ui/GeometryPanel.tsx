/**
 * 區塊 3 右：孔尺寸清單。數字用等寬字體。
 *
 * 殘留肉厚只顯示一次，標明它就是夾持長度 G——同一段材料，強度看它、夾持也看它。
 * 顯示成兩個獨立數字會讓人把安全邊界算兩次。
 */

import type { Result } from '../core/types';

function Row({
  label,
  value,
  tag,
}: {
  label: string;
  value: string;
  tag?: string;
}) {
  return (
    <tr>
      <th>{label}</th>
      <td>
        {value}
        {tag && <span className="tag">{tag}</span>}
      </td>
    </tr>
  );
}

export function GeometryPanel({ result }: { result: Result }) {
  const g = result.geometry;
  const d = result.derivation;
  const defaultTag = result.threadDepthSource === 'default' ? '預設值' : undefined;
  const modeTag = result.tapDepthMode === 'given' ? '現有件' : undefined;

  return (
    <table className="dims">
      <tbody>
        <Row label="沉頭孔" value={`Ø${g.counterboreDia} × 深 ${g.counterboreDepth}`} />
        <Row label="通孔" value={`Ø${g.throughDia}`} />
        <Row label="底孔" value={g.drillDepth === null ? '—（現有件，未知）' : `Ø${g.tapDrillDia} × 深 ${g.drillDepth}`} tag={g.drillDepth === null ? undefined : defaultTag} />
        <Row label="攻牙深 H" value={`${g.tapDepth}`} tag={modeTag ?? defaultTag} />
        <Row label="有效牙深 H_eff" value={`${d.hEff}`} tag={defaultTag} />
        <Row
          label="殘留肉厚 ＝ 夾持長度 G"
          value={`${g.remainingWall}　(下限 ${d.remainingWallMin})`}
          tag={d.remainingWallMaterialAssumed ? '以下件材質代入' : undefined}
        />
      </tbody>
    </table>
  );
}
