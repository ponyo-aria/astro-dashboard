// Open-Meteo Elevation API で標高（メートル）を取得する。
// 複数地点をまとめて渡すと、同じ順番で配列が返ってくる。
// 参考：https://api.open-meteo.com/v1/elevation?latitude=..&longitude=..

const ELEVATION_API_URL = 'https://api.open-meteo.com/v1/elevation'

/**
 * 複数地点の標高をまとめて取得する。
 * @param {{ lat: number, lng: number }[]} points
 * @returns {Promise<number[]>} 標高（メートル）の配列。points と同じ順番。
 */
export async function fetchElevations(points) {
  if (points.length === 0) {
    return []
  }

  const url = new URL(ELEVATION_API_URL)
  url.searchParams.set('latitude', points.map((p) => p.lat).join(','))
  url.searchParams.set('longitude', points.map((p) => p.lng).join(','))

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`標高の取得に失敗しました（status: ${response.status}）`)
  }

  const data = await response.json()
  return data.elevation
}

/**
 * 1地点の標高を取得する。
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<number>}
 */
export async function fetchElevation(lat, lng) {
  const [elevation] = await fetchElevations([{ lat, lng }])
  return elevation
}
