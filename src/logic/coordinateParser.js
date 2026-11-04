// 「35.42, 138.58」のような座標の貼り付けや、
// Googleマップの長いURL（@緯度,経度 を含むもの）から緯度・経度を取り出す。

// 緯度は -90〜90、経度は -180〜180 の範囲に収まっているか確認する
function isValidLatLng(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

// 短縮URL（maps.app.goo.gl など）は、ブラウザのJavaScriptからは
// リダイレクト先を読み取れない（CORSの制約）ため展開できない。
// そのため「短縮URLかどうか」だけを判定し、専用のエラーメッセージを出す。
function isShortGoogleMapsUrl(text) {
  return /maps\.app\.goo\.gl|goo\.gl\/maps/i.test(text)
}

/**
 * 貼り付けられた文字列から緯度・経度を取り出す。
 * 成功時: { ok: true, lat, lng }
 * 失敗時: { ok: false, reason: 'short_url' | 'invalid' }
 */
export function parseCoordinateInput(input) {
  const text = (input ?? '').trim()

  if (text === '') {
    return { ok: false, reason: 'invalid' }
  }

  if (isShortGoogleMapsUrl(text)) {
    return { ok: false, reason: 'short_url' }
  }

  // Googleマップの長いURLに含まれる「@緯度,経度」の形式
  const atFormMatch = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (atFormMatch) {
    const lat = Number(atFormMatch[1])
    const lng = Number(atFormMatch[2])
    if (isValidLatLng(lat, lng)) {
      return { ok: true, lat, lng }
    }
    return { ok: false, reason: 'invalid' }
  }

  // 「35.42, 138.58」のような単純な座標の貼り付け
  const plainMatch = text.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (plainMatch) {
    const lat = Number(plainMatch[1])
    const lng = Number(plainMatch[2])
    if (isValidLatLng(lat, lng)) {
      return { ok: true, lat, lng }
    }
    return { ok: false, reason: 'invalid' }
  }

  return { ok: false, reason: 'invalid' }
}
