import { defineConfig } from 'vite'
import { serviceWorkerPlugin } from './scripts/serviceWorkerPlugin.js'

export default defineConfig({
  // GitHub Pages ではリポジトリ名のサブパス配下に公開されるため、
  // 相対パスにしてどのリポジトリ名でも動くようにする。
  base: './',
  plugins: [
    // PWA化：ビルド時に dist/sw.js（アプリ本体を端末に保存する仕組み）を作る。
    // ホーム画面に追加するための設定は public/manifest.webmanifest。
    serviceWorkerPlugin(),
  ],
  test: {
    // localStorage など、ブラウザ相当の機能をテストで使えるようにする
    environment: 'jsdom',
  },
})
