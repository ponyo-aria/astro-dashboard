// 地点管理画面。地点の追加・編集・削除・並べ替え、JSONの書き出し・読み込みを行う。

import { parseCoordinateInput } from '../logic/coordinateParser.js'
import { fetchElevation } from '../api/elevation.js'
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
  let formState = { name: '', lat: '', lng: '', elevation: '', error: '' }
  let importMode = 'replace'

  function persist() {
    saveLocations(locations)
    onChange?.()
  }

  function openAddForm() {
    editingId = 'new'
    formState = { name: '', lat: '', lng: '', elevation: '', error: '' }
    render()
  }

  function openEditForm(loc) {
    editingId = loc.id
    formState = {
      name: loc.name,
      lat: String(loc.lat),
      lng: String(loc.lng),
      elevation: loc.elevation === null ? '' : String(loc.elevation),
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

    // 標高を自動取得する（失敗しても手入力できるので画面は止めない）
    try {
      const elevation = await fetchElevation(result.lat, result.lng)
      formState.elevation = String(elevation)
    } catch {
      formState.error = '標高の自動取得に失敗しました。手で入力してください'
    }
    render()
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

    const lngInput = document.createElement('input')
    lngInput.type = 'text'
    lngInput.placeholder = '経度'
    lngInput.value = formState.lng
    lngInput.addEventListener('input', (e) => {
      formState.lng = e.target.value
    })

    const elevationInput = document.createElement('input')
    elevationInput.type = 'text'
    elevationInput.placeholder = '標高（m・自動取得／手で修正可）'
    elevationInput.value = formState.elevation
    elevationInput.addEventListener('input', (e) => {
      formState.elevation = e.target.value
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
    const section = document.createElement('div')
    section.className = 'backup-section'

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

    return section
  }

  render()
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
