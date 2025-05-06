// MCP サーバーの基本クラスをインポート - サーバー機能の中核となるクラス
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// HTTP経由でストリーミング通信を行うためのサーバートランスポートクラスをインポート
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
// バリデーションライブラリ zod をインポート - ツール引数の型チェックに使用
import { z } from "zod";
// Express フレームワークをインポート - HTTPサーバーの構築に使用
import express from "express";
// CORS（クロスオリジンリソース共有）ミドルウェアをインポート - 異なるオリジンからのリクエストを許可するために使用
import cors from "cors";

// Express アプリケーションインスタンスを作成 - HTTPサーバーの基盤となるオブジェクト
const app = express();
// CORSミドルウェアを追加 - フロントエンドからのクロスオリジンリクエストを許可
app.use(cors());
// リクエストボディのJSONをパースするためのミドルウェアを追加 - JSON形式のリクエストを処理するため
app.use(express.json());
// すべてのリクエストにAcceptヘッダーを追加するカスタムミドルウェア - クライアントがAcceptヘッダーを指定していない場合に対応
app.use((req, res, next) => {
  if (!req.headers.accept) {
    // Acceptヘッダーが存在しない場合、JSONとSSE（Server-Sent Events）の両方を受け入れるように設定
    req.headers.accept = "application/json, text/event-stream";
  }
  next(); // 次のミドルウェアまたはルートハンドラに処理を渡す
});

// StreamableHTTPServerTransport を初期化 - HTTPを通じてMCPメッセージをやり取りするためのトランスポート層
// ステートレスサーバーのため、sessionIdGenerator は undefined に指定（ステートフルな場合はセッションID生成関数が必要）
const transport: StreamableHTTPServerTransport =
  new StreamableHTTPServerTransport({
    // ステートレスなサーバーの場合、sessionIdGenerator に undefined を指定
    // これによりクライアントとの間でセッション状態を維持しないステートレスな通信が可能になる
    sessionIdGenerator: undefined,
  });

// MCP サーバーインスタンスを作成 - ツールの登録や実行を管理する中心的なオブジェクト
const mcpServer = new McpServer({ 
  name: "stateless-server", // サーバーの名前を指定 - クライアント側で識別に使用される
  version: "1.0.0", // サーバーのバージョンを指定 - 互換性確認やログ記録に役立つ
});

// シンプルなサイコロを振った結果を返すツールをサーバーに登録
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

// MCP サーバーをトランスポートに接続する非同期関数 - サーバー起動前の初期化処理
const setupServer = async () => {
  // mcpServerとtransportを接続 - これによりMCPメッセージの送受信が可能になる
  await mcpServer.connect(transport);
};

// /mcp エンドポイントで POST リクエストを受け付けるルートハンドラ - MCPメッセージの主要エントリーポイント
app.post("/mcp", async (req, res) => {
  // 受信したMCPリクエストをログに出力 - デバッグや監視のため
  console.log("Received MCP request:", req.body);
  try {
    // MCP SDK の transport.handleRequest メソッドを使用してリクエストを処理
    // Streamable HTTP transport では、POST リクエストで MCP メッセージを受け付ける
    // req: Expressのリクエストオブジェクト、res: Expressのレスポンスオブジェクト、req.body: リクエストボディ（JSONデータ）
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

// GET リクエストハンドラ - Streamable HTTP では GET は通常使用しないため、Method Not Allowed (405) を返す
// 旧仕様のSSEエンドポイントとの互換性を考慮して実装されている
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

// DELETE リクエストハンドラ - ステートフルサーバーでセッション削除に使用するが、ステートレスでは不要なため Method Not Allowed (405) を返す
app.delete("/mcp", async (req, res) => {
  // DELETEリクエストを受信したことをログに出力
  console.log("Received DELETE MCP request");
  // HTTP 405 Method Not Allowed ステータスコードを設定し、JSON-RPC 2.0形式のエラーレスポンスを返す
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0", // JSON-RPC 2.0プロトコルを使用
      error: {
        code: -32000, // Invalid Request または Server error を示すカスタムエラーコード
        message: "Method not allowed.", // エラーメッセージ - DELETEメソッドが許可されていないことを示す
      },
      id: null, // リクエストIDがない場合はnullを設定
    })
  );
});

// サーバーのポート番号を設定 - 環境変数PORTが設定されていればその値を使用し、なければデフォルト値3000を使用
const PORT = process.env.PORT || 3000;

// サーバーのセットアップを開始し、完了したら HTTP サーバーを起動する処理
setupServer() // MCPサーバーのセットアップを実行
  .then(() => {
    // セットアップ成功後、指定されたポートでHTTPサーバーを起動
    app.listen(PORT, () => {
      // サーバー起動成功時のログメッセージを出力
      console.log(`Stateless server is running on http://localhost:${PORT}/mcp`);
    });
  })
  .catch((err) => {
    // セットアップ中にエラーが発生した場合の処理
    console.error("Error setting up server:", err); // エラー情報をログに出力
    process.exit(1); // エラーコード1でプロセスを終了（異常終了）
  });

// SIGINT (Ctrl+Cなど) を受け取ったときのグレースフルシャットダウン処理 - リソースを適切に解放するため
process.on("SIGINT", async () => {
  // シャットダウン開始のログメッセージを出力
  console.log("Shutting down server...");
  try {
    // トランスポートを閉じる処理
    console.log(`Closing transport`); // トランスポート終了開始のログ
    await transport.close(); // トランスポートの接続を閉じる - 進行中のリクエストを適切に終了
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