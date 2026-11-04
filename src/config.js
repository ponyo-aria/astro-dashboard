// 判定に使うしきい値をここにまとめる（Step 4以降で使う）。
// 値を変えたいときは、このファイルだけ直せばよい。
export const config = {
  // 「晴れ」とみなす雲量の上限（%）
  cloudCoverClearMax: 20,
  // 「低層雲リスク」とみなす周辺点の低層雲量（%）
  lowCloudRiskThreshold: 30,
  // 「撮影可」とみなす連続した晴れ時間の下限（時間）
  minClearHours: 3,
  // 周辺点を置く距離（km）
  surroundingPointDistanceKm: 5,
  // 結露リスク：気温と露点の差（℃）。これ以下で「高」
  dewPointRiskHighMax: 2,
  // 結露リスク：気温と露点の差（℃）。これ以下で「注意」
  dewPointRiskCautionMax: 4,
  // この風速（m/s）以上で「注意」
  windCautionThreshold: 5,
}
