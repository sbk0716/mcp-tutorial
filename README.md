# MCP Tutorial

[![MCP SDK Version](https://img.shields.io/badge/MCP%20SDK-1.11.0-green)](https://github.com/modelcontextprotocol/typescript-sdk)

Model Context Protocol (MCP) を使用したステートレスおよびステートフルなサーバーとクライアントの実装例を提供するチュートリアルプロジェクトです。

## 概要

Model Context Protocol (MCP) は、AIモデルとのコミュニケーションを標準化するためのプロトコルです。このプロジェクトでは、MCPの新しい通信方式である Streamable HTTP Transport を使用したサーバーとクライアントの実装例を提供しています。

Streamable HTTP Transport は、サーバーからクライアントへのレスポンスとして Server-Sent Events (SSE) 形式を使用する通信方式で、以下の特徴があります：

- HTTP POSTリクエストでクライアントからサーバーへメッセージを送信
- Server-Sent Events (SSE) 形式でサーバーからクライアントへレスポンスを返す
- 単一エンドポイント（通常は `/mcp`）で通信
- セッション管理機能（オプション）
- 再接続メカニズム
- 後方互換性のサポート

このチュートリアルでは、以下の2つの実装アプローチを学ぶことができます：

1. **ステートレスモード**: サーバーはクライアントとのセッションを維持せず、各リクエストは独立して処理されます。
2. **ステートフルモード**: サーバーはクライアントとのセッションを維持し、状態を保持します。

## 特徴

- **ステートレスサーバーとクライアントの実装**
  - セッション管理なしのシンプルな実装
  - 水平スケーリングが容易
  - 独立したリクエスト処理

- **ステートフルサーバーとクライアントの実装**
  - セッションIDを使用した状態管理
  - イベントストアによるセッション状態の保持
  - 会話の文脈を維持した対話

- **フロントエンド実装**
  - Next.jsを使用したモダンなフロントエンド
  - Reactコンポーネントによる状態管理
  - TailwindCSSによるスタイリング

- **サンプルツール**
  - サイコロツール（dice）の実装例
  - ツール登録と実行の基本的なパターン

## 前提条件

- **Node.js**: v18.0.0以上
- **npm**: v8.0.0以上
- **TypeScript**: v5.0.0以上

## インストール

### リポジトリのクローン

```bash
git clone https://github.com/yourusername/mcp-tutorial.git
cd mcp-tutorial
```

### ステートレスサーバーとクライアントのセットアップ

```bash
cd stateless
npm install
```

### ステートフルサーバーとクライアントのセットアップ

```bash
cd stateful
npm install
```

### フロントエンドのセットアップ

```bash
cd stateful/frontend
npm install
```

## 使用方法

### ステートレスサーバーの起動

```bash
cd stateless
npm run dev
```

サーバーは `http://localhost:3000/mcp` で起動します。

### ステートレスクライアントの実行

```bash
cd stateless
npm run dev:client
```

### ステートフルサーバーの起動

```bash
cd stateful
npm run dev
```

サーバーは `http://localhost:3000/mcp` で起動します。

### ステートフルクライアントの実行

```bash
cd stateful
npm run dev:client
```

### フロントエンドの起動

```bash
cd stateful/frontend
npm run dev
```

フロントエンドは `http://localhost:8080` で起動します。

## 基本的な操作

### コマンドラインクライアント

1. `list-tools` コマンドでサーバーが提供するツール一覧を取得
2. `call-tool` コマンドでサイコロツールを実行（面の数を指定可能）
3. ステートフルクライアントの場合は `terminate-session` コマンドでセッションを終了
4. `exit` コマンドでクライアントを終了

### フロントエンドクライアント

1. 「ツール一覧を取得」ボタンでサーバーが提供するツール一覧を表示
2. サイコロツールで面の数を指定して「サイコロを振る」ボタンをクリック
3. ステートフルモードの場合は「セッションを終了」ボタンでセッションを終了

## プロジェクト構造

```
mcp-tutorial/
├── stateless/            # ステートレス実装
│   ├── client/           # コマンドラインクライアント
│   ├── server/           # ステートレスサーバー
│   └── frontend/         # シンプルなHTMLフロントエンド
│
└── stateful/             # ステートフル実装
    ├── client/           # コマンドラインクライアント
    ├── server/           # ステートフルサーバー
    └── frontend/         # Next.jsフロントエンド
```

### 主要コンポーネント

- **MCPサーバー**: ツールを登録し、クライアントからのリクエストを処理
- **トランスポート**: クライアントとサーバー間の通信を担当
- **イベントストア**: ステートフルモードでセッション状態を保持
- **ツール**: サーバーが提供する機能（例：サイコロ）
- **クライアント**: サーバーのツールを呼び出すアプリケーション

## 技術スタック

### サーバーサイド
- **Express.js**: HTTPサーバーフレームワーク
- **TypeScript**: 型安全な開発言語
- **MCP SDK**: Model Context Protocolの実装
- **Zod**: スキーマバリデーション

### クライアントサイド
- **TypeScript**: 型安全な開発言語
- **MCP SDK**: Model Context Protocolの実装

### フロントエンド
- **Next.js**: Reactフレームワーク
- **React**: UIライブラリ
- **TailwindCSS**: ユーティリティファーストのCSSフレームワーク
