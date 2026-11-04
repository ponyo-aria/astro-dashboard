// 地点データを端末内（localStorage）に保存する。
// サーバーは使わないので、このファイルがすべてのデータの出入り口になる。

import { parseCoordinateInput } from '../logic/coordinateParser.js'

const LOCATIONS_KEY = 'astro-dashboard.locations.v1'
const INITIALIZED_KEY = 'astro-dashboard.initialized.v1'

// 初回起動時のみ登録する初期地点（Step 1でオーナーに確認した座標）
const INITIAL_LOCATIONS = [
  { name: '朝霧高原', lat: 35.38759756590578, lng: 138.58241718155753 },
  { name: '八ヶ岳ふれあい公園', lat: 35.97702123485692, lng: 138.47616415360588 },
  { name: '天城高原ハイカー専用駐車場', lat: 34.87318983258313, lng: 139.02341552670438 },
]

function generateId() {
  return `loc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function makeLocation({ name, lat, lng, elevation = null }) {
  return { id: generateId(), name, lat, lng, elevation }
}

function readRawLocations() {
  const raw = localStorage.getItem(LOCATIONS_KEY)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeLocations(locations) {
  localStorage.setItem(LOCATIONS_KEY, JSON.stringify(locations))
}

/**
 * 地点一覧を読み込む。初回起動時だけ初期地点を登録する。
 */
export function loadLocations() {
  const isInitialized = localStorage.getItem(INITIALIZED_KEY) === 'true'
  const stored = readRawLocations()

  if (!isInitialized) {
    localStorage.setItem(INITIALIZED_KEY, 'true')
    if (stored === null) {
      const initial = INITIAL_LOCATIONS.map(makeLocation)
      writeLocations(initial)
      return initial
    }
  }

  return stored ?? []
}

/** 地点を1件追加する。追加した地点を返す。 */
export function addLocation(locations, { name, lat, lng, elevation = null }) {
  const newLocation = makeLocation({ name, lat, lng, elevation })
  return [...locations, newLocation]
}

/** 地点を1件更新する。 */
export function updateLocation(locations, id, changes) {
  return locations.map((loc) => (loc.id === id ? { ...loc, ...changes } : loc))
}

/** 地点を1件削除する。 */
export function removeLocation(locations, id) {
  return locations.filter((loc) => loc.id !== id)
}

/** 地点の並び順を1つ上/下に動かす。 */
export function moveLocation(locations, id, direction) {
  const index = locations.findIndex((loc) => loc.id === id)
  if (index === -1) {
    return locations
  }
  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= locations.length) {
    return locations
  }
  const next = [...locations]
  ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
  return next
}

export function saveLocations(locations) {
  writeLocations(locations)
}

/** 地点一覧をJSON文字列として書き出す。 */
export function exportLocationsToJson(locations) {
  return JSON.stringify(locations, null, 2)
}

/**
 * JSON文字列から地点一覧を読み込む。
 * mode: 'replace'（置き換え） | 'append'（追加）
 * 不正な内容の場合はエラーを投げる。
 */
export function importLocationsFromJson(currentLocations, jsonText, mode) {
  let parsed
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error('JSONの形式が正しくありません')
  }

  if (!Array.isArray(parsed)) {
    throw new Error('JSONの形式が正しくありません（地点の配列である必要があります）')
  }

  const imported = parsed.map((item) => {
    const lat = Number(item.lat)
    const lng = Number(item.lng)
    const validation = parseCoordinateInput(`${lat}, ${lng}`)
    if (!item.name || typeof item.name !== 'string' || !validation.ok) {
      throw new Error('地点データの中に、名前または座標が不正なものがあります')
    }
    return makeLocation({
      name: item.name,
      lat,
      lng,
      elevation: typeof item.elevation === 'number' ? item.elevation : null,
    })
  })

  if (mode === 'append') {
    return [...currentLocations, ...imported]
  }
  return imported
}
