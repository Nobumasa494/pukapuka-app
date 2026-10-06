// 島の植え方を数値で確かめる（RN に依存しない計算だけを動かす）。
// 使い方（リポジトリの直下で）: npx -y tsx scripts/island/check-layout.ts
// 時期ごとに、記録の数・植物の数・島の半径・グループ・植物どうしのいちばん近い距離を出す
import { STAGES, capturesUntil, layoutIsland, makeIslandSample } from '../../src/islandLayout';

const all = makeIslandSample(Date.now());
for (const st of STAGES) {
  const cs = capturesUntil(all, st.days);
  const L = layoutIsland(cs);
  const groups = new Map<number, string[]>();
  for (const p of L.plants) {
    if (!groups.has(p.group)) groups.set(p.group, []);
    groups.get(p.group)!.push(`${p.word}(${p.count})`);
  }
  console.log(`== ${st.label}: 記録 ${cs.length} / 植物 ${L.plants.length} / 半径 ${L.radius.toFixed(2)}`);
  for (const [g, ws] of groups) console.log(`  g${g}: ${ws.join(' ')}`);
  let minD = Infinity;
  for (let i = 0; i < L.plants.length; i++)
    for (let j = i + 1; j < L.plants.length; j++)
      minD = Math.min(minD, Math.hypot(L.plants[i].x - L.plants[j].x, L.plants[i].z - L.plants[j].z));
  console.log(`  いちばん近い植物どうしの距離: ${minD.toFixed(2)}（0.6 未満なら重なって見える）`);
}
