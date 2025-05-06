# MCP Streamable HTTP Transport ガイド

## 概要

Model Context Protocol (MCP) の Streamable HTTP transport は、サーバーからクライアントへのレスポンスとして Server-Sent Events (SSE) 形式を使用する通信方式です。この文書では、Streamable HTTP transportの概念、実装方法、レスポンスデータの分析、およびクライアント側での適切な処理方法について説明します。

## Streamable HTTPの概要

Streamable HTTP transportは、MCPの標準的な通信方式で、以下の特徴があります：

- HTTP POSTリクエストでクライアントからサーバーへメッセージを送信
- Server-Sent Events (SSE) 形式でサーバーからクライアントへレスポンスを返す
- 単一エンドポイント（通常は `/mcp`）で通信
- セッション管理機能（オプション）
- 再接続メカニズム
- 後方互換性のサポート

Streamable HTTP transportは、以下のような利点があります：

- ステートレスなサーバー実装が可能
- プレーンなHTTPサーバーとして実装可能
- スケーラビリティの向上
- ネットワーク中断からの回復力
- 水平スケーリングが容易

## レスポンス形式

### 1. ヘッダー情報

サーバーからのレスポンスには以下のヘッダーが含まれます：

```
Content-Type: text/event-stream
Cache-Control: no-cache
```

`text/event-stream` は SSE 形式のコンテンツであることを示します。

### 2. SSEメッセージ構造

レスポンスの本文は以下のような構造になっています：

```
event: message
data: {"result":{"tools":[{"name":"dice","description":"サイコロを振った結果を返します","inputSchema":{"type":"object","properties":{"sides":{"type":"number","minimum":1,"default":6,"description":"サイコロの面の数"}},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}}]},"jsonrpc":"2.0","id":1}
```

主な特徴：
- `event: message` - イベントタイプを示す行
- `data: {...}` - JSON形式のデータを含む行

### 3. データ構造

`data:` 行に含まれるJSONデータは、JSON-RPC 2.0形式に準拠しています：

```json
{
  "result": {
    "tools": [
      {
        "name": "dice",
        "description": "サイコロを振った結果を返します",
        "inputSchema": {
          "type": "object",
          "properties": {
            "sides": {
              "type": "number",
              "minimum": 1,
              "default": 6,
              "description": "サイコロの面の数"
            }
          },
          "additionalProperties": false,
          "$schema": "http://json-schema.org/draft-07/schema#"
        }
      }
    ]
  },
  "jsonrpc": "2.0",
  "id": 1
}
```

## クライアント側での処理

### 1. Acceptヘッダーの設定

クライアントからのリクエスト時には、以下のヘッダーを設定する必要があります：

```
Accept: application/json, text/event-stream
```

サーバーは、クライアントが両方の形式を受け付けることを要求しています。

### 2. SSEレスポンスの処理

SSEレスポンスを処理するには、以下の手順が必要です：

1. レスポンスのテキストを取得
2. SSE形式かどうかを判定（`event:` または `data:` を含むか）
3. SSE形式の場合、`data:` で始まる行からJSONデータを抽出
4. 抽出したJSONデータをパース

```javascript
const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream'
  },
  body: JSON.stringify(requestBody)
});

const text = await response.text();
let data;

if (text.includes('event:') || text.includes('data:')) {
  // SSEメッセージからJSONデータを抽出
  const jsonData = text.split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.substring(6).trim())
    .join('');
  
  data = JSON.parse(jsonData);
} else {
  // 通常のJSONレスポンスの場合
  data = JSON.parse(text);
}
```

## セッション管理とステートレスモード

Streamable HTTP transportでは、ステートフルモードとステートレスモードの2つの動作モードをサポートしています。

### ステートフルモード（セッション管理あり）

ステートフルモードでは、サーバーはクライアントとのセッションを維持し、状態を保持します：

- クライアントは初回接続時にセッションを確立
- サーバーはセッションIDを生成し、`Mcp-Session-Id`ヘッダーで返す
- 以降のリクエストでは、クライアントはこのセッションIDをヘッダーに含める
- セッションは明示的に終了するか、タイムアウトするまで維持される

サーバー側の実装例：

```typescript
// セッションIDごとにトランスポートを保持するオブジェクト
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

app.post('/mcp', async (req, res) => {
  // セッションIDをヘッダーから取得
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    // 既存のセッションを再利用
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // 新しいセッションを作成
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        // セッションIDとトランスポートを保存
        transports[sessionId] = transport;
      }
    });

    // トランスポートが閉じられたときの処理
    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };

    // サーバーに接続
    await mcpServer.connect(transport);
  } else {
    // 無効なリクエスト
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
    return;
  }

  // リクエストを処理
  await transport.handleRequest(req, res, req.body);
});
```

### ステートレスモード（セッション管理なし）

ステートレスモードでは、サーバーはクライアントとのセッションを維持せず、各リクエストは独立して処理されます：

- 各リクエストごとに新しいトランスポートとサーバーインスタンスを作成
- セッションIDは使用しない（`sessionIdGenerator: undefined`）
- リクエスト間で状態は保持されない

サーバー側の実装例：

```typescript
app.post('/mcp', async (req, res) => {
  try {
    // 各リクエストごとに新しいインスタンスを作成
    const server = getServer(); 
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // ステートレスモード
    });
    
    // リクエスト終了時のクリーンアップ
    res.on('close', () => {
      transport.close();
      server.close();
    });
    
    // サーバーに接続してリクエストを処理
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    // エラー処理
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});
```

ステートレスモードは以下のような場合に適しています：
- シンプルなAPIラッパー
- 各リクエストが独立している場合
- 水平スケーリングが必要な場合
- セッション状態を共有する必要がない場合

## クライアント実装例

### 基本的な実装

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// クライアントの作成
const client = new Client({
  name: 'example-client',
  version: '1.0.0'
});

// トランスポートの作成と接続
const transport = new StreamableHTTPClientTransport(
  new URL('http://localhost:3000/mcp')
);
await client.connect(transport);

// ツール一覧の取得
const tools = await client.listTools();
console.log('Available tools:', tools);

// ツールの実行
const result = await client.callTool({
  name: 'dice',
  arguments: { sides: 6 }
});
console.log('Dice result:', result);

// 接続の終了
await transport.close();
```

### セッションIDの指定

```typescript
// 既存のセッションIDを指定してトランスポートを作成
const transport = new StreamableHTTPClientTransport(
  new URL('http://localhost:3000/mcp'),
  {
    sessionId: 'existing-session-id'
  }
);
```

### 再接続オプションの設定

```typescript
// 再接続オプションを指定してトランスポートを作成
const transport = new StreamableHTTPClientTransport(
  new URL('http://localhost:3000/mcp'),
  {
    reconnectionOptions: {
      maxReconnectionDelay: 60000,    // 最大60秒
      initialReconnectionDelay: 2000, // 初期2秒
      reconnectionDelayGrowFactor: 2, // 指数バックオフ係数
      maxRetries: 5                   // 最大5回再試行
    }
  }
);
```

## 開発者ツールでの表示

ブラウザの開発者ツール（Network タブ）では、SSEレスポンスが以下のように表示されることがあります：

- Response タブ: "Failed to load response data"
- EventStream タブ: SSEメッセージの内容

これは、SSEがストリーミング形式のレスポンスであり、開発者ツールが通常のHTTPレスポンスとは異なる方法で処理するためです。また、JavaScriptコードがレスポンスストリームを消費した後は、開発者ツールがアクセスできなくなる場合もあります。

## 実際のレスポンス例

### ツール一覧取得（tools/list）

```
event: message
data: {"result":{"tools":[{"name":"dice","description":"サイコロを振った結果を返します","inputSchema":{"type":"object","properties":{"sides":{"type":"number","minimum":1,"default":6,"description":"サイコロの面の数"}},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}}]},"jsonrpc":"2.0","id":1}
```

### サイコロ実行（tools/call）

```
event: message
data: {"result":{"content":[{"type":"text","text":"4"}]},"jsonrpc":"2.0","id":2}
```

## SDK実装の詳細

Streamable HTTP transportの実装は、`@modelcontextprotocol/sdk`パッケージの以下のクラスで提供されています：

### StreamableHTTPClientTransport

クライアント側の実装で、以下の主要な機能を提供します：

#### 構成オプション

`StreamableHTTPClientTransportOptions`インターフェースで以下の設定が可能です：

- **authProvider**: 認証用のOAuthクライアントプロバイダー
- **requestInit**: HTTPリクエストのカスタマイズ
- **reconnectionOptions**: 再接続動作の設定
- **sessionId**: セッションID（指定しない場合、サーバーが生成）

#### 再接続メカニズム

`StreamableHTTPReconnectionOptions`インターフェースで以下の設定が可能です：

- **maxReconnectionDelay**: 再接続試行間の最大バックオフ時間（デフォルト30秒）
- **initialReconnectionDelay**: 再接続試行間の初期バックオフ時間（デフォルト1秒）
- **reconnectionDelayGrowFactor**: 再接続遅延の増加係数（デフォルト1.5）
- **maxRetries**: 再接続試行の最大回数（デフォルト2）

#### 主要メソッド

- **start()**: 接続を開始
- **finishAuth()**: 認証完了後の処理
- **close()**: 接続を閉じる
- **send()**: メッセージを送信
- **terminateSession()**: セッションを明示的に終了

### StreamableHTTPServerTransport

サーバー側の実装で、SSEレスポンスの生成を担当します。主な機能：

- **sessionIdGenerator**: セッションIDの生成方法を指定
- **onsessioninitialized**: セッション初期化時のコールバック
- **onclose**: トランスポートが閉じられたときのコールバック
- **handleRequest**: リクエストの処理

## セッション管理

Streamable HTTP transportでは、ステートフルなサーバーとの通信においてセッション管理が重要な役割を果たします。

### セッションID

- クライアントは接続時にセッションIDを指定できます
- セッションIDが指定されない場合、サーバーが新しいセッションIDを生成します
- セッションIDは`Mcp-Session-Id`ヘッダーを通じてやり取りされます

### セッションの終了

クライアントは`terminateSession()`メソッドを呼び出すことで、明示的にセッションを終了できます：

```typescript
// セッションを明示的に終了
await transport.terminateSession();
```

このメソッドは、サーバーに対してHTTP DELETEリクエストを送信し、セッションを終了するよう要求します。サーバーがセッション終了をサポートしていない場合、HTTP 405（Method Not Allowed）エラーが返されることがあります。

## エラーハンドリング

Streamable HTTP transportでは、以下のようなエラーハンドリングメカニズムが提供されています：

### StreamableHTTPError

通信エラーを表すカスタムエラークラスです：

```typescript
class StreamableHTTPError extends Error {
  readonly code: number | undefined;
  constructor(code: number | undefined, message: string | undefined);
}
```

### エラーコールバック

`StreamableHTTPClientTransport`クラスには、エラー発生時に呼び出されるコールバックを設定できます：

```typescript
transport.onerror = (error: Error) => {
  console.error('Transport error:', error);
};
```

### 再接続メカニズム

通信エラーが発生した場合、設定された再接続オプションに基づいて自動的に再接続を試みます。再接続は指数バックオフアルゴリズムに従って行われ、設定された最大試行回数に達すると停止します。

## 後方互換性

Streamable HTTP transportは、旧来のHTTP+SSE transportとの後方互換性を提供しています。これにより、新しいクライアントは古いサーバーと通信でき、新しいサーバーは古いクライアントからのリクエストを処理できます。

### クライアント側の後方互換性

古いサーバーと通信する必要があるクライアントの実装例：

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

let client: Client|undefined = undefined;
const baseUrl = new URL('http://localhost:3000');

try {
  // まず、Streamable HTTP transportで接続を試みる
  client = new Client({
    name: 'compatible-client',
    version: '1.0.0'
  });
  const transport = new StreamableHTTPClientTransport(baseUrl);
  await client.connect(transport);
  console.log("Connected using Streamable HTTP transport");
} catch (error) {
  // 4xxエラーが発生した場合、旧来のSSE transportを試す
  console.log("Streamable HTTP connection failed, falling back to SSE transport");
  client = new Client({
    name: 'compatible-client',
    version: '1.0.0'
  });
  const sseTransport = new SSEClientTransport(baseUrl);
  await client.connect(sseTransport);
  console.log("Connected using SSE transport");
}
```

### サーバー側の後方互換性

古いクライアントからのリクエストを処理する必要があるサーバーの実装例：

```typescript
// Streamable HTTP用のエンドポイント
app.all('/mcp', async (req, res) => {
  // Streamable HTTP transportの処理
  // ...
});

// 旧来のSSE用のエンドポイント
app.get('/sse', async (req, res) => {
  // SSE transportの処理
  const transport = new SSEServerTransport('/messages', res);
  transports.sse[transport.sessionId] = transport;
  
  res.on("close", () => {
    delete transports.sse[transport.sessionId];
  });
  
  await server.connect(transport);
});

// 旧来のメッセージ用のエンドポイント
app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.sse[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(400).send('No transport found for sessionId');
  }
});
```

**注意**: SSE transportは現在非推奨であり、新しい実装ではStreamable HTTP transportを使用することが推奨されています。

## まとめ

1. Streamable HTTP transportは、SSE形式を使用してサーバーからクライアントにデータを送信します
2. クライアントは、`Accept: application/json, text/event-stream`ヘッダーを設定する必要があります
3. レスポンスは`event: message`と`data: {...}`の形式で返されます
4. クライアント側では、SSE形式のレスポンスを適切に処理するためのコードが必要です
5. 開発者ツールでは、SSEレスポンスが正しく表示されない場合があります
6. StreamableHTTPClientTransportクラスは、セッション管理や再接続などの高度な機能を提供します
7. エラーハンドリングメカニズムにより、通信エラーに対して適切に対応できます
8. ステートフルモードとステートレスモードの2つの動作モードをサポートしています
9. 旧来のHTTP+SSE transportとの後方互換性を提供しています

## 参考資料

- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Model Context Protocol ドキュメント](https://modelcontextprotocol.io)
- [MCP 仕様](https://spec.modelcontextprotocol.io)
