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

  describe('標高の自動取得', () => {
    it('標高が「未設定」の地点（初期地点など）は、開いたときに1回の問い合わせでまとめて取得して保存する', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ elevation: [900.4, 1350, 812.6] }) })
      vi.stubGlobal('fetch', fetchMock)
      const container = setup()

      await vi.waitFor(() => expect(container.textContent).toContain('標高：900m'))
      expect(container.textContent).toContain('標高：1350m')
      expect(container.textContent).toContain('標高：813m')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const url = new URL(fetchMock.mock.calls[0][0])
      expect(url.searchParams.get('latitude').split(',')).toHaveLength(3)
      // 端末にも保存されている（次に開いたときは取りに行かない）
      const saved = JSON.parse(localStorage.getItem('astro-dashboard.locations.v1'))
      expect(saved.map((l) => l.elevation)).toEqual([900, 1350, 813])
    })

    it('取得に失敗しても、地点管理は普通に使える（標高は「未設定」のまま）', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
      const container = setup()
      await new Promise((r) => setTimeout(r, 0))
      expect(container.querySelectorAll('.location-card')).toHaveLength(3)
      expect(container.textContent).toContain('標高：未設定')
    })

    it('緯度・経度を直接打ち込んだときも標高を自動取得する。手で直した標高は上書きしない', async () => {
      const container = setup()
      await new Promise((r) => setTimeout(r, 0))
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ elevation: [1500.2] }) }))

      ;[...container.querySelectorAll('button')].find((b) => b.textContent === '＋ 地点を追加').click()
      const input = (ph) => container.querySelector(`.location-form input[placeholder^="${ph}"]`)
      const type = (ph, value, events = ['input', 'change']) => {
        input(ph).value = value
        events.forEach((ev) => input(ph).dispatchEvent(new Event(ev)))
      }
      type('緯度', '36.1')
      type('経度', '138.2')
      await vi.waitFor(() => expect(input('標高').value).toBe('1500'))

      // 標高を手で直してから経度を打ち直しても、手で直した値のまま
      type('標高', '1480', ['input'])
      type('経度', '138.3')
      await new Promise((r) => setTimeout(r, 0))
      expect(input('標高').value).toBe('1480')
    })
  })
})
