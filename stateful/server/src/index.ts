// MCP サーバーの基本クラスをインポート - サーバー機能の中核となるクラス
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// HTTP経由でストリーミング通信を行うためのサーバートランスポートクラスをインポート
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
// バリデーションライブラリ zod をインポート - ツール引数の型チェックに使用
import { z } from "zod";
// Express フレームワークをインポート - HTTPサーバーの構築に使用
import express from "express";
// リクエストが初期化リクエストかどうかを判定するヘルパー関数をインポート
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
// Node.jsの暗号モジュールからランダムUUID生成関数をインポート - セッションID生成に使用
import { randomUUID } from "node:crypto";
// インメモリイベントストアをインポート - セッション状態を一時的に保持するためのストレージ
import { InMemoryEventStore } from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";

// セッション ID ごとに StreamableHTTPServerTransport インスタンスを保持するオブジェクト - アクティブなセッションを管理
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// MCP サーバーインスタンスを作成 - ツールの登録や実行を管理する中心的なオブジェクト
const mcpServer = new McpServer({ 
  name: "stateful-server", // サーバーの名前を指定 - クライアント側で識別に使用される
  version: "1.0.0", // サーバーのバージョンを指定 - 互換性確認やログ記録に役立つ
});

// シンプルなサイコロを振った結果を返すツールをサーバーに登録 - ステートレス版と同じ機能
mcpServer.tool(
  // ツールの名前 - クライアントがツールを呼び出す際に使用する識別子
  "dice",
  // ツールの説明 - クライアントに表示される説明文
  "サイコロを振った結果を返します",
  // ツールの引数のスキーマを zod で定義 - 型安全性を確保し、バリデーションを自動化
  { 
    sides: z.number() // 数値型の引数
      .min(1) // 最小値は1（0面のサイコロは存在しないため）
      .default(6) // デフォルト値は6（標準的なサイコロ）
      .describe("サイコロの面の数") // 引数の説明
  },
  // ツールが実行されたときの処理を定義する非同期関数
  async (input) => {
    // 入力から面の数を取得、未指定の場合はデフォルト値6を使用
    const sides = input.sides ?? 6;
    // 1からsidesまでのランダムな整数を生成（サイコロを振る処理）
    const result = Math.floor(Math.random() * sides) + 1;
    // MCP形式のレスポンスを返す
    return {
      content: [
        {
          type: "text", // コンテンツタイプはテキスト
          text: result.toString(), // 数値結果を文字列に変換して返す
        },
      ],
    };
  }
);

// HTTP サーバーのセットアップ - Express フレームワークを使用
const app = express(); // Expressアプリケーションインスタンスを作成
const cors = require('cors'); // CORSミドルウェアをインポート - クロスオリジンリクエストを許可するため

// CORSの詳細設定 - セキュリティと互換性のバランスを取る
app.use(cors({
  origin: ['http://localhost:8080', 'http://localhost:3000'], // フロントエンドのオリジンを許可 - 開発環境のポート
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'], // 許可するHTTPメソッド - MCPで使用するメソッドのみ
  allowedHeaders: ['Content-Type', 'Accept', 'Mcp-Session-Id'], // 許可するヘッダー - MCPに必要なヘッダー
  exposedHeaders: ['Mcp-Session-Id'], // クライアントに公開するヘッダー - セッションIDをクライアントが読めるようにする
  credentials: true, // クレデンシャルを許可 - Cookieなどの認証情報を含めることを許可
  maxAge: 86400 // プリフライトリクエストのキャッシュ時間（秒） - 1日間キャッシュ
}));

// OPTIONSリクエストに対するハンドラ - プリフライトリクエストに対応
app.options('/mcp', (req, res) => {
  res.status(200).end(); // 200 OKを返して成功を示す
});

// JSONリクエストボディをパースするミドルウェアを追加
app.use(express.json());

// すべてのリクエストにAcceptヘッダーを追加するカスタムミドルウェア - クライアントがAcceptヘッダーを指定していない場合に対応
app.use((req, res, next) => {
  if (!req.headers.accept) {
    // Acceptヘッダーが存在しない場合、JSONとSSE（Server-Sent Events）の両方を受け入れるように設定
    req.headers.accept = "application/json, text/event-stream";
  }
  next(); // 次のミドルウェアまたはルートハンドラに処理を渡す
});

// /mcp エンドポイントでの POST リクエストハンドラ - MCPメッセージの主要エントリーポイント
app.post("/mcp", async (req, res) => {
  try {
    // リクエストヘッダーから Mcp-Session-Id を取得 - 既存セッションの識別に使用
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    // セッション処理の分岐 - 既存セッション、新規セッション、無効なセッションの3パターンを処理
    if (sessionId && transports[sessionId]) {
      // 既存セッションの場合 - セッションIDがヘッダーに存在し、対応するtransportが存在する場合
      transport = transports[sessionId]; // 既存のトランスポートを再利用
    } else if (
      // 新規セッション初期化の条件 - 以下のいずれかの場合に新しいセッションを作成
      // 1. セッションIDがなく、リクエストが初期化リクエスト
      // 2. セッションIDがなく、メソッドが'initialize'（フロントエンド用の特別対応）
      // 3. メソッドが'server/info'（サーバー情報取得リクエスト）
      ((isInitializeRequest(req.body) || req.body.method === 'initialize') &&
      !sessionId) || req.body.method === 'server/info'
    ) {
      console.log('Initializing new session for request:', req.body); // 新規セッション初期化ログ
      
      // 新しいセッション用のイベントストアを作成 - セッション状態を保持するためのストレージ
      const eventStore = new InMemoryEventStore(); // 実際の本番環境では永続化可能なストアを使用すべき
      
      // 新しいトランスポートを作成 - ステートフルサーバー用の設定
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(), // セッションIDとしてランダムUUIDを生成する関数
        eventStore, // セッション状態を保持するイベントストア
        onsessioninitialized: (sessionId) => {
          // セッションが初期化されたときのコールバック - セッションIDが生成された後に呼ばれる
          console.log(`Session initialized with ID: ${sessionId}`); // セッション初期化ログ
          transports[sessionId] = transport; // セッションIDとトランスポートの対応関係を保存
        },
      });

      // トランスポートがクローズされたときのハンドラを設定 - リソース解放のため
      transport.onclose = () => {
        const sid = transport.sessionId; // クローズされるトランスポートのセッションID
        if (sid && transports[sid]) {
          console.log(`Transport closed for session ID: ${sid}`); // トランスポート終了ログ
          delete transports[sid]; // トランスポートをオブジェクトから削除
        }
      };

      // 新しいトランスポートをMCPサーバーに接続
      await mcpServer.connect(transport);
      // リクエストを処理 - 初期化リクエストの場合はセッションIDを含むレスポンスが返される
      await transport.handleRequest(req, res, req.body);
      return; // 処理完了 - 以降のコードは実行しない
    } else {
      // 無効なセッションの場合 - セッションIDがないか、対応するトランスポートが存在しない
      // 400 Bad Request エラーを返す
      res.status(400).json({
        jsonrpc: "2.0", // JSON-RPC 2.0プロトコルを使用
        error: {
          code: -32000, // カスタムエラーコード
          message: "Bad Request: No valid session ID provided", // エラーメッセージ
        },
        id: null, // リクエストIDがない場合はnullを設定
      });
      return; // 処理完了 - 以降のコードは実行しない
    }

    // 既存セッションの処理 - 対応するトランスポートを使用してリクエストを処理
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    // エラーが発生した場合はログに出力
    console.error("Error handling MCP request:", error);
    // レスポンスヘッダーがまだ送信されていない場合のみエラーレスポンスを返す
    if (!res.headersSent) {
      // HTTP 500エラー（サーバー内部エラー）とJSON-RPC 2.0形式のエラーレスポンスを返す
      res.status(500).json({
        jsonrpc: "2.0", // JSON-RPC 2.0プロトコルを使用
        error: {
          code: -32603, // 内部サーバーエラーを示すJSON-RPC 2.0のエラーコード
          message: "Internal server error", // エラーメッセージ
        },
        id: null, // リクエストIDがない場合はnullを設定
      });
    }
  }
});

// /mcp エンドポイントでの DELETE リクエストハンドラ - セッション終了処理
// ステートフルサーバーの場合、DELETE リクエストはセッションを明示的に終了するために使用される
app.delete("/mcp", async (req, res) => {
  // リクエストヘッダーからセッション ID を取得 - 終了するセッションの識別
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  // セッション ID のバリデーション - 存在しないか無効な場合はエラー
  if (!sessionId || !transports[sessionId]) {
    // 400 Bad Request エラーを返す
    res
      .status(400)
      .send("Invalid or missing session ID. Please provide a valid session ID.");
    return; // 処理を終了
  }

  // セッション終了処理開始のログ
  console.log(`Closing session for ID: ${sessionId}`);
  try {
    // 該当するトランスポートを取得
    const transport = transports[sessionId];
    // トランスポートのhandleRequestメソッドにDELETEリクエストを渡す
    // DELETEリクエストを受け取ると、トランスポートはセッション終了処理を実行
    await transport.handleRequest(req, res);
    // 処理完了後、transport.oncloseコールバックが呼ばれ、transportsオブジェクトから削除される
  } catch (error) {
    // エラーが発生した場合
    console.error("Error closing transport:", error); // エラーログ
    // レスポンスがまだ送信されていない場合はエラーレスポンスを返す
    if (!res.headersSent) {
      res.status(500).send("Error closing transport"); // 500 Internal Server Error
    }
  }
});

// GET リクエストハンドラ - Method Not Allowed (405) を返す
// MCPではGETメソッドは通常使用しないため、エラーを返す
app.get("/mcp", async (req, res) => {
  // GETリクエストを受信したことをログに出力
  console.log("Received GET MCP request");
  // HTTP 405 Method Not Allowed ステータスコードを設定し、JSON-RPC 2.0形式のエラーレスポンスを返す
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0", // JSON-RPC 2.0プロトコルを使用
      error: {
        code: -32000, // Invalid Request または Server error を示すカスタムエラーコード
        message: "Method not allowed.", // エラーメッセージ - GETメソッドが許可されていないことを示す
      },
      id: null, // リクエストIDがない場合はnullを設定
    })
  );
});

// サーバーのポート番号を設定 - 環境変数PORTが設定されていればその値を使用し、なければデフォルト値3000を使用
const PORT = process.env.PORT || 3000;

// HTTP サーバーの起動 - 指定されたポートでリクエストの待ち受けを開始
app.listen(PORT, () => {
  // サーバー起動成功時のログメッセージを出力
  console.log(`Stateful server is running on http://localhost:${PORT}/mcp`);
});

// SIGINT (Ctrl+Cなど) を受け取ったときのグレースフルシャットダウン処理 - リソースを適切に解放するため
process.on("SIGINT", async () => {
  // シャットダウン開始のログメッセージを出力
  console.log("Shutting down server...");
  try {
    // 保持しているすべてのトランスポートを閉じる - アクティブなセッションをすべて終了
    for (const sessionId in transports) {
      const transport = transports[sessionId];
      if (transport) {
        await transport.close(); // トランスポートを閉じる - 進行中のリクエストを適切に終了
        console.log(`Transport closed for session ID: ${sessionId}`); // 終了ログ
      }
    }
  } catch (error) {
    // トランスポート終了中にエラーが発生した場合
    console.error(`Error closing transport:`, error); // エラー情報をログに出力
  }
  // MCP サーバーを閉じる - サーバーリソースを解放
  await mcpServer.close();
  // シャットダウン完了のログメッセージを出力
  console.log("Server shutdown complete");
  process.exit(0); // 終了コード0でプロセスを終了（正常終了）
});