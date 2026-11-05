// ランチャー：他のWebサイトを開くためのリンクを作る。
// サイトやURLを変えたいときは、下の LAUNCHER_ITEMS だけ直せばよい。
//
// ※Polaris Scope・SkySafari 7 Plus（Androidアプリ）は、Chromeの安全のための制限で
//   Webページから直接起動できないことを実機で確認したため、ランチャーには入れていない
//   （ホーム画面から開く運用。Polaris Scope 相当の機能はMVP完成後に自前で作る予定）。

/**
 * Windy を、指定した地点を中心に開くURLを作る。
 * 形式：https://www.windy.com/?緯度,経度,拡大率,d:picker（d:picker は地点に目印を立てる指定）
 * Windy の決まりで、緯度・経度は小数点付きで渡す必要がある（50 ではなく 50.000）。
 */
export function windyUrl(location) {
  const lat = Number(location.lat).toFixed(3)
  const lng = Number(location.lng).toFixed(3)
  return `https://www.windy.com/?${lat},${lng},10,d:picker`
}

// ランチャーに並べるボタンの一覧
// needsLocation：true のものは、地点（基準地点）の座標を使う
export const LAUNCHER_ITEMS = [
  { id: 'windy', label: 'Windy', needsLocation: true, buildUrl: (location) => windyUrl(location) },
  { id: 'scw', label: 'SCW', buildUrl: () => 'https://supercweather.com/' },
  { id: 'astrobin', label: 'AstroBin', buildUrl: () => 'https://www.astrobin.com/' },
]
