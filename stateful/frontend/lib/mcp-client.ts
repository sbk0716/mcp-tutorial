// MCP クライアントの基本クラスをインポート - クライアント機能の中核となるクラス
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
// HTTP経由でストリーミング通信を行うためのトランスポートクラスをインポート
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  CallToolRequest, // ツール呼び出しリクエストの型定義 - サーバー上のツールを実行するためのリクエスト形式
  CallToolResultSchema, // ツール呼び出し結果のスキーマ定義 - サーバーからの応答を検証するために使用
  ListToolsRequest, // ツール一覧リクエストの型定義 - サーバーが提供するツール一覧を取得するためのリクエスト形式
  ListToolsResultSchema, // ツール一覧結果のスキーマ定義 - サーバーからのツール一覧応答を検証するために使用
} from "@modelcontextprotocol/sdk/types.js"; // MCP のリクエスト/レスポンス スキーマが定義されているモジュール

// シングルトンインスタンス - アプリケーション全体で単一のクライアント/トランスポートインスタンスを共有するため
let client: Client | null = null; // MCPクライアントのシングルトンインスタンス
let transport: StreamableHTTPClientTransport | null = null; // トランスポートのシングルトンインスタンス
let sessionId: string | undefined; // 現在のセッションID - セッション状態を維持するために使用

// サーバーのURL - MCPサーバーのエンドポイントを定義（ローカルホスト上のポート3000にある/mcpパス）
const SERVER_URL = 'http://localhost:3000/mcp';

/**
 * MCPクライアントを初期化する非同期関数
 * 既に初期化されている場合は既存のインスタンスを返す - シングルトンパターンの実装
 * @returns 初期化されたMCPクライアントインスタンス
 */
export async function initializeClient() {
  // クライアントとトランスポートが既に初期化されている場合は既存のインスタンスを返す
  if (client && transport) return client;

  try {
    // 初期化開始のログ出力
    console.log("Initializing MCP client..."); // クライアント初期化開始メッセージ
    console.log("Server URL:", SERVER_URL); // 接続先サーバーURLの表示
    
    // MCPクライアントインスタンスの作成 - サーバーとの通信を管理する中心的なオブジェクト
    client = new Client({
      name: "stateful-frontend", // クライアントの名前を指定 - サーバー側でクライアントを識別するために使用
      version: "1.0.0" // クライアントのバージョンを指定 - 互換性確認やログ記録に役立つ
    });

    // クライアントでエラーが発生した場合のイベントハンドラを設定 - 通信エラーや内部エラーを捕捉
    client.onerror = (error) => {
      console.error("Client error:", error); // エラー情報をコンソールに出力して開発者が問題を特定できるようにする
    };

    // Streamable HTTP トランスポートを初期化 - MCPサーバーとの通信チャネルを確立
    transport = new StreamableHTTPClientTransport(
      new URL(SERVER_URL), // サーバーのエンドポイントURLを指定
      {
        sessionId, // 前回のセッションID (あれば) を設定 - 再接続時に使用
        requestInit: {
          // CORSの問題を回避するためのヘッダーを追加 - ブラウザ環境での通信に必要
          headers: {
            'Content-Type': 'application/json', // リクエストボディがJSON形式であることを指定
            'Accept': 'application/json, text/event-stream' // JSONとSSEの両方を受け入れる
          },
          // クレデンシャルを含める - Cookieなどの認証情報をリクエストに含める
          credentials: 'include',
          // モードをcorsに設定 - クロスオリジンリクエストを許可
          mode: 'cors'
        }
      }
    );

    // サーバーに接続するリクエストを送信 - トランスポートを通じてサーバーとの接続を確立
    console.log("Connecting to server..."); // サーバー接続開始メッセージ
    await client.connect(transport);
    console.log("Connected to server"); // 接続成功メッセージ
    
    // セッションIDを保存 - 以降のリクエストで使用するためにグローバル変数に保存
    if (transport.sessionId) {
      sessionId = transport.sessionId; // トランスポートから取得したセッションIDを保存
      console.log("Session initialized with ID:", sessionId); // セッションID初期化成功メッセージ
    } else {
      console.warn("No session ID received from server"); // セッションID取得失敗警告
    }

    return client; // 初期化されたクライアントインスタンスを返す
  } catch (error) {
    // 初期化中にエラーが発生した場合
    console.error("Error initializing client:", error); // エラー情報をログに出力
    throw error; // エラーを呼び出し元に伝播させる
  }
}

/**
 * 現在のセッションIDを取得する関数
 * @returns 現在のセッションID、未初期化の場合はundefined
 */
export function getSessionId() {
  return sessionId; // 現在保持しているセッションIDを返す
}

/**
 * セッションを終了する非同期関数 - ステートフルサーバーとの接続を明示的に終了する
 * @throws セッション終了処理中にエラーが発生した場合
 */
export async function terminateSession() {
  // トランスポートが初期化されていない場合は処理を終了
  if (!transport) {
    console.log("No active transport to terminate"); // アクティブなトランスポートがない旨のメッセージ
    return;
  }
  
  try {
    // transport.terminateSession() メソッドを呼び出し - サーバーにDELETEリクエストを送信してセッションを終了
    await transport.terminateSession();
    console.log("Session terminated"); // セッション終了成功メッセージ
    sessionId = undefined; // セッションIDをクリア - 変数の整合性を保つ
    
    // クライアントとトランスポートを閉じる - リソースを解放
    await closeClient();
  } catch (error) {
    // セッション終了処理中にエラーが発生した場合
    console.error("Error terminating session:", error); // エラー情報をログに出力
    throw error; // エラーを呼び出し元に伝播させる
  }
}

/**
 * クライアントとトランスポートを閉じる非同期関数 - リソースを適切に解放するためのクリーンアップ処理
 * @throws クライアントまたはトランスポートの終了処理中にエラーが発生した場合
 */
export async function closeClient() {
  try {
    // トランスポートが初期化されている場合は閉じる
    if (transport) {
      await transport.close(); // トランスポートを閉じる - サーバーとの通信チャネルを終了
      console.log("Transport closed"); // トランスポート終了メッセージ
    }
    
    // クライアントが初期化されている場合は閉じる
    if (client) {
      await client.close(); // クライアントを閉じる - クライアントリソースを解放
      console.log("Client closed"); // クライアント終了メッセージ
    }
    
    // インスタンスをリセット - 次回の初期化に備える
    client = null; // クライアントインスタンスをnullに設定
    transport = null; // トランスポートインスタンスをnullに設定
  } catch (error) {
    // 終了処理中にエラーが発生した場合
    console.error("Error closing client:", error); // エラー情報をログに出力
    throw error; // エラーを呼び出し元に伝播させる
  }
}

/**
 * ツール一覧を取得する非同期関数 - サーバーから利用可能なツールの一覧を取得
 * @returns ツール一覧の配列
 * @throws ツール一覧取得中にエラーが発生した場合
 */
export async function listTools() {
  // クライアントが初期化されていない場合は初期化 - 必要に応じて自動的に初期化処理を実行
  const mcpClient = await initializeClient();
  
  try {
    // ListToolsRequest 型に従ってリクエストオブジェクトを作成 - MCP仕様に準拠したリクエスト形式
    const req: ListToolsRequest = {
      method: "tools/list", // ツール一覧取得メソッドを指定 - MCP仕様で定義されたメソッド名
      params: {}, // パラメータは空オブジェクト - このメソッドでは追加パラメータは不要
    };
    
    // client.request メソッドでサーバーにリクエストを送信し、応答を待機
    const res = await mcpClient.request(req, ListToolsResultSchema);
    return res.tools; // ツール一覧を返す
  } catch (error) {
    // エラーが発生した場合
    console.error("Error listing tools:", error); // エラー情報をログに出力
    throw error; // エラーを呼び出し元に伝播させる
  }
}

/**
 * サイコロを振る非同期関数 - サーバー上のdiceツールを呼び出してサイコロの結果を取得
 * @param sides サイコロの面数
 * @returns サイコロの結果（文字列）
 * @throws 入力値が不正な場合、またはサイコロ実行中にエラーが発生した場合
 */
export async function rollDice(sides: number) {
  // 入力値のバリデーション - 不正な入力（NaNや0以下の値）をチェック
  if (isNaN(sides) || sides <= 0) {
    throw new Error("Invalid number of sides"); // 不正な入力の場合はエラーをスロー
  }
  
  // クライアントが初期化されていない場合は初期化 - 必要に応じて自動的に初期化処理を実行
  const mcpClient = await initializeClient();
  
  try {
    // CallToolRequest 型に従ってリクエストオブジェクトを作成 - MCP仕様に準拠
    const req: CallToolRequest = {
      method: "tools/call", // ツール呼び出しメソッドを指定 - MCP仕様で定義されたメソッド名
      params: {
        name: "dice", // 呼び出すツールの名前を指定 - サーバー側で登録されているツール名
        arguments: { sides }, // ツールに渡す引数を指定 - サイコロの面数
      },
    };
    
    // client.request メソッドでサーバーにリクエストを送信し、応答を待機
    const res = await mcpClient.request(req, CallToolResultSchema);
    
    // レスポンスからテキスト形式の結果を探す - contentは配列形式で複数の要素を含む可能性がある
    const textContent = res.content.find(item => item.type === "text");
    if (textContent) {
      return textContent.text; // テキストコンテンツが見つかった場合はその値を返す
    } else {
      throw new Error("No text content in response"); // テキストコンテンツが見つからない場合はエラー
    }
  } catch (error) {
    // エラーが発生した場合
    console.error("Error rolling dice:", error); // エラー情報をログに出力
    throw error; // エラーを呼び出し元に伝播させる
  }
}