// 地点管理画面。地点の追加・編集・削除・並べ替え、JSONの書き出し・読み込みを行う。

import { parseCoordinateInput } from '../logic/coordinateParser.js'
import { fetchElevation, fetchElevations } from '../api/elevation.js'
import { isOffline } from '../api/forecastLoader.js'
import {
  loadLocations,
  addLocation,
  updateLocation,
  removeLocation,
  moveLocation,
  saveLocations,
  exportLocationsToJson,
  importLocationsFromJson,
} from '../storage/locationsStorage.js'

const SHORT_URL_MESSAGE =
  '短縮URL（maps.app.goo.gl など）は読み取れません。地図アプリで座標をコピーして貼ってください（例：35.42, 138.58）'
const INVALID_MESSAGE =
  '座標を読み取れませんでした。「35.42, 138.58」の形式、またはGoogleマップの長いURLを貼ってください'

export function renderLocationsScreen(container, { onChange } = {}) {
  let locations = loadLocations()
  // 編集中の地点ID（nullなら新規追加フォームを閉じている状態）
  let editingId = null
  // elevationAuto：標高欄が自動取得した値か（手で直した値は、座標を変えても上書きしない）
  let formState = { name: '', lat: '', lng: '', elevation: '', elevationAuto: false, error: '' }
  let importMode = 'replace'
  // バックアップの欄を開いているか（ほとんど使わない機能なので、ふだんは閉じておく）
  let backupOpen = false

  function persist() {
    saveLocations(locations)
    onChange?.()
  }

  function openAddForm() {
    editingId = 'new'
    formState = { name: '', lat: '', lng: '', elevation: '', elevationAuto: false, error: '' }
    render()
  }

  function openEditForm(loc) {
    editingId = loc.id
    formState = {
      name: loc.name,
      lat: String(loc.lat),
      lng: String(loc.lng),
      elevation: loc.elevation === null ? '' : String(loc.elevation),
      elevationAuto: false,
      error: '',
    }
    render()
  }

  function closeForm() {
    editingId = null
    render()
  }

  async function handlePasteInput(value) {
    const result = parseCoordinateInput(value)
    if (!result.ok) {
      formState.error = result.reason === 'short_url' ? SHORT_URL_MESSAGE : INVALID_MESSAGE
      render()
      return
    }
    formState.lat = String(result.lat)
    formState.lng = String(result.lng)
    formState.error = ''
    render()

    // 標高を自動取得する（座標を貼り付けたときは、標高も新しい座標のものに入れ替える）
    await autoFillElevation({ force: true })
  }

  /**
   * フォームの座標から標高を自動取得する（失敗しても手入力できるので画面は止めない）。
   * force：手で入れた標高があっても入れ替える（座標を貼り付けたとき）
   */
  async function autoFillElevation({ force = false } = {}) {
    const coords = parseCoordinateInput(`${formState.lat}, ${formState.lng}`)
    if (!coords.ok) return
    // 手で直した標高は、緯度・経度を打ち直しても上書きしない
    if (!force && formState.elevation !== '' && !formState.elevationAuto) return
    try {
      const elevation = await fetchElevation(coords.lat, coords.lng)
      formState.elevation = String(Math.round(elevation))
      formState.elevationAuto = true
    } catch {
      formState.error = '標高の自動取得に失敗しました。手で入力してください'
    }
    render()
  }

  /**
   * 標高が「未設定」の地点の標高を、まとめて自動取得して保存する
   * （初期地点・JSONから読み込んだ地点など）。圏外などで失敗したら、次に開いたときにまた試す。
   */
  async function fillMissingElevations() {
    const missing = locations.filter((loc) => loc.elevation == null)
    if (missing.length === 0 || isOffline()) return
    try {
      const elevations = await fetchElevations(missing.map((loc) => ({ lat: loc.lat, lng: loc.lng })))
      const byId = new Map(missing.map((loc, i) => [loc.id, elevations?.[i]]))
      // 取得している間に地点が編集・削除されていても大丈夫なよう、今の一覧に当てはめる
      locations = locations.map((loc) => {
        const value = byId.get(loc.id)
        return loc.elevation == null && typeof value === 'number'
          ? { ...loc, elevation: Math.round(value) }
          : loc
      })
      persist()
      render()
    } catch {
      // 失敗しても地点管理は使える。標高は「未設定」のまま
    }
  }

  function handleSubmit() {
    const name = formState.name.trim()
    const lat = Number(formState.lat)
    const lng = Number(formState.lng)
    const validation = parseCoordinateInput(`${formState.lat}, ${formState.lng}`)

    if (name === '') {
      formState.error = '名前を入力してください'
      render()
      return
    }
    if (!validation.ok) {
      formState.error = INVALID_MESSAGE
      render()
      return
    }

    const elevation = formState.elevation === '' ? null : Number(formState.elevation)

    if (editingId === 'new') {
      locations = addLocation(locations, { name, lat, lng, elevation })
    } else {
      locations = updateLocation(locations, editingId, { name, lat, lng, elevation })
    }
    persist()
    editingId = null
    render()
  }

  function handleDelete(id) {
    if (!window.confirm('この地点を削除しますか？')) {
      return
    }
    locations = removeLocation(locations, id)
    persist()
    render()
  }

  function handleMove(id, direction) {
    locations = moveLocation(locations, id, direction)
    persist()
    render()
  }

  function handleExport() {
    const json = exportLocationsToJson(locations)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'astro-dashboard-locations.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImportFile(file) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        locations = importLocationsFromJson(locations, String(reader.result), importMode)
        persist()
        render()
        fillMissingElevations() // 読み込んだ地点に標高が無ければ取得する
      } catch (err) {
        window.alert(`読み込みに失敗しました：${err.message}`)
      }
    }
    reader.readAsText(file)
  }

  function render() {
    container.innerHTML = ''

    const heading = document.createElement('h2')
    heading.textContent = '地点管理'
    container.appendChild(heading)

    container.appendChild(renderList())
    container.appendChild(renderAddButtonOrForm())
    container.appendChild(renderBackupSection())
  }

  function renderList() {
    const list = document.createElement('div')
    list.className = 'location-list'

    locations.forEach((loc, index) => {
      if (editingId === loc.id) {
        list.appendChild(renderForm())
        return
      }

      const card = document.createElement('div')
      card.className = 'location-card'

      const info = document.createElement('div')
      info.innerHTML = `
        <strong>${escapeHtml(loc.name)}</strong><br>
        緯度${loc.lat}, 経度${loc.lng}<br>
        標高：${loc.elevation === null ? '未設定' : `${loc.elevation}m`}
      `
      card.appendChild(info)

      const buttons = document.createElement('div')
      buttons.className = 'location-card-buttons'

      const upButton = makeButton('▲', () => handleMove(loc.id, 'up'))
      upButton.disabled = index === 0
      const downButton = makeButton('▼', () => handleMove(loc.id, 'down'))
      downButton.disabled = index === locations.length - 1
      const editButton = makeButton('編集', () => openEditForm(loc))
      const deleteButton = makeButton('削除', () => handleDelete(loc.id))

      buttons.append(upButton, downButton, editButton, deleteButton)
      card.appendChild(buttons)
      list.appendChild(card)
    })

    return list
  }

  function renderAddButtonOrForm() {
    const wrapper = document.createElement('div')
    if (editingId === 'new') {
      wrapper.appendChild(renderForm())
    } else if (editingId === null) {
      wrapper.appendChild(makeButton('＋ 地点を追加', openAddForm))
    }
    return wrapper
  }

  function renderForm() {
    const form = document.createElement('div')
    form.className = 'location-form'

    const nameInput = document.createElement('input')
    nameInput.type = 'text'
    nameInput.placeholder = '地点名'
    nameInput.value = formState.name
    nameInput.addEventListener('input', (e) => {
      formState.name = e.target.value
    })

    const pasteInput = document.createElement('input')
    pasteInput.type = 'text'
    pasteInput.placeholder = '座標を貼り付け（35.42, 138.58 またはGoogleマップのURL）'
    pasteInput.addEventListener('change', (e) => handlePasteInput(e.target.value))

    const latInput = document.createElement('input')
    latInput.type = 'text'
    latInput.placeholder = '緯度'
    latInput.value = formState.lat
    latInput.addEventListener('input', (e) => {
      formState.lat = e.target.value
    })
    // 緯度・経度を直接打ち込んだときも、2つとも正しく入ったら標高を自動取得する
    latInput.addEventListener('change', () => autoFillElevation())

    const lngInput = document.createElement('input')
    lngInput.type = 'text'
    lngInput.placeholder = '経度'
    lngInput.value = formState.lng
    lngInput.addEventListener('input', (e) => {
      formState.lng = e.target.value
    })
    lngInput.addEventListener('change', () => autoFillElevation())

    const elevationInput = document.createElement('input')
    elevationInput.type = 'text'
    elevationInput.placeholder = '標高（m・自動取得／手で修正可）'
    elevationInput.value = formState.elevation
    elevationInput.addEventListener('input', (e) => {
      formState.elevation = e.target.value
      formState.elevationAuto = false // 手で直した値
    })

    form.append(nameInput, pasteInput, latInput, lngInput, elevationInput)

    if (formState.error) {
      const errorText = document.createElement('p')
      errorText.className = 'error-message'
      errorText.textContent = formState.error
      form.appendChild(errorText)
    }

    const saveButton = makeButton('保存', handleSubmit)
    const cancelButton = makeButton('キャンセル', closeForm)
    const buttonRow = document.createElement('div')
    buttonRow.append(saveButton, cancelButton)
    form.appendChild(buttonRow)

    return form
  }

  function renderBackupSection() {
    // ふだんはボタンだけを出し、押したときだけ中身（書き出し・読み込み）を開く
    const toggle = makeButton(
      backupOpen ? 'バックアップを閉じる' : 'バックアップ（書き出し・読み込み）',
      () => {
        backupOpen = !backupOpen
        render()
      }
    )
    toggle.classList.add('backup-toggle')
    toggle.setAttribute('aria-expanded', String(backupOpen))
    if (!backupOpen) return toggle

    const wrapper = document.createElement('div')
    wrapper.appendChild(toggle)
    const section = document.createElement('div')
    section.className = 'backup-section'
    wrapper.appendChild(section)

    const heading = document.createElement('h3')
    heading.textContent = 'バックアップ'
    section.appendChild(heading)

    const exportButton = makeButton('JSONを書き出す', handleExport)
    section.appendChild(exportButton)

    const modeSelect = document.createElement('select')
    ;[
      { value: 'replace', label: '置き換え' },
      { value: 'append', label: '追加' },
    ].forEach(({ value, label }) => {
      const option = document.createElement('option')
      option.value = value
      option.textContent = label
      modeSelect.appendChild(option)
    })
    modeSelect.value = importMode
    modeSelect.addEventListener('change', (e) => {
      importMode = e.target.value
    })
    section.appendChild(modeSelect)

    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'application/json'
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0]
      if (file) {
        handleImportFile(file)
      }
    })
    section.appendChild(fileInput)

    return wrapper
  }

  render()
  // 標高が「未設定」の地点があれば、開いたときにまとめて取得する
  fillMissingElevations()
}

function makeButton(label, onClick) {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.addEventListener('click', onClick)
  return button
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
