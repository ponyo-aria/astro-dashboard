import { defineConfig } from 'vite'

export default defineConfig({
  // GitHub Pages ではリポジトリ名のサブパス配下に公開されるため、
  // 相対パスにしてどのリポジトリ名でも動くようにする。
  base: './',
  test: {
    // localStorage など、ブラウザ相当の機能をテストで使えるようにする
    environment: 'jsdom',
  },
})
