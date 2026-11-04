# 進捗報告

このファイルには、各ステップで決めたことと進捗を記録する。

## 決定事項（プロジェクト全体）

- フォルダ構成：`src/screens`（画面）、`src/logic`（判定・天文計算ロジック）、`src/api`（通信）、`src/storage`（保存）、`src/config.js`（しきい値などの設定）、`tests`（テスト）、`public`（アイコンなど静的ファイル）
- GitHub Pages への公開方法：シンプルな方法（`npm run build` → `gh-pages` パッケージで公開用ブランチに反映）を採用
- GitHub のメールアドレスは非公開にし、コミットには noreply アドレスを使う（手順は Step 0 の報告に記載）
- APIキーやパスワードなどの秘密情報はコミットしない（将来必要になった場合は `.env` ＋ `.gitignore` で除外し、コミット前に必ず確認する）
- 報告書を含め、住所など個人を特定できる情報は書かない
- コミット前には `git status` の内容を一緒に確認してから進める
- 破壊的な操作（force push・ブランチ削除・公開範囲の変更など）は事前に説明し、オーナーの了承を得てから実行する

## Step 0：開発環境と土台づくり

- Vite（vanilla JavaScript）でプロジェクトの土台を作成
- 上記フォルダ構成で配置
- 「Hello」を表示する画面を作成
- Vitest を導入し、ダミーテスト1件を用意
- `npm test` が通ることを確認
- `npm run build` が通ることを確認
- GitHub リポジトリ：`ponyo-aria/astro-dashboard`（Public）を作成
- コミットのメールアドレスは GitHub の noreply アドレスをこのリポジトリのローカル設定として使用（PC全体の設定は変更していない）
- GitHub Pages は無料プランではPrivateリポジトリで使えないことが判明したため、Publicリポジトリに変更して対応（ソースコードは公開されるが、秘密情報・個人情報は含めない方針を徹底）
- `gh-pages` パッケージで `npm run deploy` → `gh-pages` ブランチに公開
- GitHub Pages の設定（Branch: `gh-pages`、フォルダ: `/`）はオーナーが画面操作
