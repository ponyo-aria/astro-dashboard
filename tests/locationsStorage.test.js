import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadLocations,
  addLocation,
  updateLocation,
  removeLocation,
  moveLocation,
  saveLocations,
  exportLocationsToJson,
  importLocationsFromJson,
} from '../src/storage/locationsStorage.js'

beforeEach(() => {
  localStorage.clear()
})

describe('loadLocations', () => {
  it('初回起動時は初期3地点が登録される', () => {
    const locations = loadLocations()
    expect(locations).toHaveLength(3)
    expect(locations.map((l) => l.name)).toEqual([
      '朝霧高原',
      '八ヶ岳ふれあい公園',
      '天城高原ハイカー専用駐車場',
    ])
  })

  it('2回目以降はlocalStorageの内容がそのまま読み込まれる（初期地点を全部消しても復活しない）', () => {
    loadLocations() // 初回起動
    saveLocations([]) // 全部削除した状態を保存
    const locations = loadLocations() // 2回目の起動
    expect(locations).toEqual([])
  })
})

describe('追加・更新・削除・並べ替え', () => {
  it('地点を追加できる', () => {
    const added = addLocation([], { name: 'テスト地点', lat: 35, lng: 138 })
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ name: 'テスト地点', lat: 35, lng: 138 })
    expect(added[0].id).toBeTruthy()
  })

  it('地点を更新できる', () => {
    const locations = addLocation([], { name: 'A', lat: 35, lng: 138 })
    const updated = updateLocation(locations, locations[0].id, { name: 'B' })
    expect(updated[0].name).toBe('B')
  })

  it('地点を削除できる', () => {
    const locations = addLocation([], { name: 'A', lat: 35, lng: 138 })
    const removed = removeLocation(locations, locations[0].id)
    expect(removed).toHaveLength(0)
  })

  it('地点を1つ下へ移動できる', () => {
    let locations = addLocation([], { name: 'A', lat: 35, lng: 138 })
    locations = addLocation(locations, { name: 'B', lat: 35, lng: 138 })
    const moved = moveLocation(locations, locations[0].id, 'down')
    expect(moved.map((l) => l.name)).toEqual(['B', 'A'])
  })

  it('先頭の地点を上へ移動しようとしても順番は変わらない', () => {
    let locations = addLocation([], { name: 'A', lat: 35, lng: 138 })
    locations = addLocation(locations, { name: 'B', lat: 35, lng: 138 })
    const moved = moveLocation(locations, locations[0].id, 'up')
    expect(moved.map((l) => l.name)).toEqual(['A', 'B'])
  })
})

describe('JSON書き出し・読み込み', () => {
  it('書き出したJSONを読み込むと元に戻る', () => {
    const locations = addLocation([], { name: 'A', lat: 35.1, lng: 138.1 })
    const json = exportLocationsToJson(locations)
    const imported = importLocationsFromJson([], json, 'replace')
    expect(imported).toHaveLength(1)
    expect(imported[0]).toMatchObject({ name: 'A', lat: 35.1, lng: 138.1 })
  })

  it('「追加」モードでは既存の地点に追加される', () => {
    const existing = addLocation([], { name: '既存', lat: 35, lng: 138 })
    const json = exportLocationsToJson(addLocation([], { name: '新規', lat: 36, lng: 139 }))
    const result = importLocationsFromJson(existing, json, 'append')
    expect(result.map((l) => l.name)).toEqual(['既存', '新規'])
  })

  it('「置き換え」モードでは既存の地点が消える', () => {
    const existing = addLocation([], { name: '既存', lat: 35, lng: 138 })
    const json = exportLocationsToJson(addLocation([], { name: '新規', lat: 36, lng: 139 }))
    const result = importLocationsFromJson(existing, json, 'replace')
    expect(result.map((l) => l.name)).toEqual(['新規'])
  })

  it('不正なJSONを読み込むとエラーになる', () => {
    expect(() => importLocationsFromJson([], '{ 壊れたJSON', 'replace')).toThrow()
  })

  it('配列ではないJSONを読み込むとエラーになる', () => {
    expect(() => importLocationsFromJson([], '{"name":"A"}', 'replace')).toThrow()
  })

  it('範囲外の座標を含むJSONを読み込むとエラーになる', () => {
    const badJson = JSON.stringify([{ name: 'A', lat: 999, lng: 138 }])
    expect(() => importLocationsFromJson([], badJson, 'replace')).toThrow()
  })
})
