// スマホの位置情報から「現在地」を取る。
//
// ・現在地は、暗い時間・月の出入り・表の時刻の目安（基準地点）にだけ使う。どこにも送らない
//   （予報は登録した地点だけ取る）
// ・最後に取れた現在地は端末に覚えておく。次に開いたときもすぐ使え、圏外でも使える
// ・位置情報を許可しなかった／取れなかったときは null を返す（呼び出し側で別の地点を使う）

const STORAGE_KEY = 'astro-dashboard.currentPosition.v1'
export const CURRENT_LOCATION_ID = '__current__'
// 同じ場所とみなす距離（度）。約500m以内の移動なら、計算し直さない
const SAME_PLACE_DEGREES = 0.005

/** 最後に取れた現在地（無ければ null） */
export function loadLastPosition() {
  try {
    const pos = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return typeof pos?.lat === 'number' && typeof pos?.lng === 'number' ? pos : null
  } catch {
    return null
  }
}

function savePosition(pos) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos))
  } catch {
    // 保存できなくても、今開いている間は使える
  }
}

/** 現在地を、登録地点と同じ形（基準地点として使える形）にする */
export function currentLocationFrom(pos) {
  return {
    id: CURRENT_LOCATION_ID,
    name: '現在地',
    lat: pos.lat,
    lng: pos.lng,
    elevation: pos.elevation ?? 0,
  }
}

/** 2つの現在地が「ほぼ同じ場所」か */
export function isSamePlace(a, b) {
  if (!a || !b) return false
  return Math.abs(a.lat - b.lat) < SAME_PLACE_DEGREES && Math.abs(a.lng - b.lng) < SAME_PLACE_DEGREES
}

/**
 * スマホに現在地を聞く。初めてのときは、ブラウザが「位置情報の使用を許可しますか？」と聞いてくる。
 * @returns {Promise<{lat:number, lng:number, elevation:number, obtainedAt:number} | null>}
 */
export function requestCurrentPosition({ timeoutMs = 10000 } = {}) {
  return new Promise((resolve) => {
    const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined
    if (!geo) {
      resolve(null)
      return
    }
    geo.getCurrentPosition(
      (result) => {
        const pos = {
          lat: result.coords.latitude,
          lng: result.coords.longitude,
          elevation: result.coords.altitude ?? 0,
          obtainedAt: Date.now(),
        }
        savePosition(pos)
        resolve(pos)
      },
      () => resolve(null), // 許可されなかった・取れなかった
      // 精度は低めでよい（暗い時間の計算には数km程度の差は影響しない）。10分以内に取った位置なら使い回す
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60 * 1000 }
    )
  })
}
