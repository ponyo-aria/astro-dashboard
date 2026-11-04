import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderLocationsScreen } from '../src/screens/locationsScreen.js'

beforeEach(() => {
  localStorage.clear()
  // 標高APIはテストでは呼ばない（通信しないようにモック化）
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ elevation: [123] }),
    })
  )
})

function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  renderLocationsScreen(container)
  return container
}

describe('地点管理画面', () => {
  it('初期表示で3つの地点カードが出る', () => {
    const container = setup()
    const cards = container.querySelectorAll('.location-card')
    expect(cards).toHaveLength(3)
  })

  it('「＋ 地点を追加」を押すとフォームが出て、保存すると地点が増える', () => {
    const container = setup()

    const addButton = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === '＋ 地点を追加'
    )
    addButton.click()

    const nameInput = container.querySelector('.location-form input[placeholder="地点名"]')
    nameInput.value = 'テスト地点'
    nameInput.dispatchEvent(new Event('input'))

    const latInput = container.querySelector('.location-form input[placeholder="緯度"]')
    latInput.value = '35'
    latInput.dispatchEvent(new Event('input'))

    const lngInput = container.querySelector('.location-form input[placeholder="経度"]')
    lngInput.value = '138'
    lngInput.dispatchEvent(new Event('input'))

    const saveButton = [...container.querySelectorAll('.location-form button')].find(
      (b) => b.textContent === '保存'
    )
    saveButton.click()

    const cards = container.querySelectorAll('.location-card')
    expect(cards).toHaveLength(4)
    expect(container.textContent).toContain('テスト地点')
  })

  it('不正な座標で保存しようとするとエラーメッセージが出て件数は増えない', () => {
    const container = setup()

    const addButton = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === '＋ 地点を追加'
    )
    addButton.click()

    const nameInput = container.querySelector('.location-form input[placeholder="地点名"]')
    nameInput.value = '不正地点'
    nameInput.dispatchEvent(new Event('input'))

    const latInput = container.querySelector('.location-form input[placeholder="緯度"]')
    latInput.value = '999'
    latInput.dispatchEvent(new Event('input'))

    const lngInput = container.querySelector('.location-form input[placeholder="経度"]')
    lngInput.value = '138'
    lngInput.dispatchEvent(new Event('input'))

    const saveButton = [...container.querySelectorAll('.location-form button')].find(
      (b) => b.textContent === '保存'
    )
    saveButton.click()

    expect(container.querySelector('.error-message')).toBeTruthy()
    expect(container.querySelectorAll('.location-card')).toHaveLength(3)
  })

  it('削除ボタンを押すと地点が減る（確認ダイアログはOK扱い）', () => {
    vi.stubGlobal('confirm', () => true)
    const container = setup()

    const deleteButton = [...container.querySelectorAll('.location-card-buttons button')].find(
      (b) => b.textContent === '削除'
    )
    deleteButton.click()

    expect(container.querySelectorAll('.location-card')).toHaveLength(2)
  })
})
