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
// 標準入力を非同期で扱うためのNode.jsモジュール
import { createInterface } from "readline/promises";

// サーバーのポート番号を設定 - 環境変数STATEFUL_SERVER_PORTが設定されていればその値を使用し、なければデフォルト値3000を使用
const PORT = process.env.STATEFUL_SERVER_PORT || 3000;

// セッション ID と transport を保持する変数 - セッション状態を維持するために使用
let sessionId: string | undefined; // サーバーから発行されるセッションIDを保持する変数
let transport: StreamableHTTPClientTransport | undefined; // サーバーとの通信を担当するトランスポートインスタンス

// MCP クライアントインスタンスを作成 - サーバーとの通信を管理する中心的なオブジェクト
const client = new Client({
  name: "stateful-client", // クライアントの名前を指定 - サーバー側でクライアントを識別するために使用
  version: "1.0.0", // クライアントのバージョンを指定 - 互換性確認やログ記録に役立つ
});

// クライアントでエラーが発生した場合のイベントハンドラを設定 - 通信エラーや内部エラーを捕捉
client.onerror = (error) => {
  console.error("Client error:", error); // エラー情報をコンソールに出力して開発者が問題を特定できるようにする
};

// 標準入力を受け取るためのreadlineインターフェイスを作成 - ユーザーからのコマンド入力を処理するため
const readline = createInterface({
  input: process.stdin,  // 標準入力（キーボード）からの入力を受け付ける
  output: process.stdout, // 標準出力（コンソール）に出力する
});

// サーバーが提供するツール一覧を取得する非同期関数 - 利用可能なツールをユーザーに表示するため
async function listTools() {
  // ListToolsRequest 型に従ってリクエストオブジェクトを作成 - MCP仕様に準拠したリクエスト形式
  const req: ListToolsRequest = {
    method: "tools/list", // ツール一覧取得メソッドを指定 - MCP仕様で定義されたメソッド名
    params: {}, // パラメータは空オブジェクト - このメソッドでは追加パラメータは不要
  };
  // transport が存在しない場合はエラーメッセージを表示して処理を終了
  if (!transport) {
    console.error("Not connected to a server."); // サーバー未接続エラーメッセージ
    return;
  }
  try {
    // client.request メソッドでサーバーにリクエストを送信し、応答を待機
    // SDKが自動的に Mcp-Session-Id ヘッダーを追加 - セッション識別のため
    const res = await client.request(req, ListToolsResultSchema);
    if (res.tools.length === 0) {
      console.log("No tools available."); // ツールが存在しない場合のメッセージ
    } else {
      // 取得したツール情報を順番に表示 - 各ツールの名前と説明をコンソールに出力
      for (const tool of res.tools) {
        console.log(`Tool Name: ${tool.name}`); // ツール名を表示
        console.log(`Tool Description: ${tool.description}`); // ツールの説明を表示
        console.log("------------------------------"); // 区切り線を表示して視認性を向上
      }
    }
  } catch (error) {
    // エラーが発生した場合はコンソールにエラー情報を出力
    console.error("Error listing tools:", error);
  }
}

// サーバー上のツールを実行する非同期関数 - 今回の実装ではdiceツール（サイコロ）を呼び出す
async function callTool() {
  // transport が存在しない場合はエラーメッセージを表示して処理を終了
  if (!transport) {
    console.error("Not connected to a server."); // サーバー未接続エラーメッセージ
    return;
  }

  // 標準入力からサイコロの面の数をユーザーに質問して取得
  const sides = await readline.question(
    "Enter the number of sides on the dice: " // ユーザーにサイコロの面数の入力を促すプロンプト
  );
  const sidesNumber = Number(sides); // 入力された文字列を数値に変換

  // 入力値のバリデーション - 不正な入力（NaNや0以下の値）をチェック
  if (isNaN(sidesNumber) || sidesNumber <= 0) {
    console.error("Invalid input. Please enter a positive number."); // エラーメッセージを表示
    return; // 不正な入力の場合は関数を終了
  }

  // CallToolRequest 型に従ってリクエストオブジェクトを作成 - MCP仕様に準拠
  const req: CallToolRequest = {
    method: "tools/call", // ツール呼び出しメソッドを指定 - MCP仕様で定義されたメソッド名
    params: {
      name: "dice", // 呼び出すツールの名前を指定 - サーバー側で登録されているツール名
      arguments: { sides: sidesNumber }, // ツールに渡す引数を指定 - サイコロの面数
    },
  };

  try {
    // client.request メソッドでサーバーにリクエストを送信し、応答を待機
    // SDKが自動的に Mcp-Session-Id ヘッダーを追加 - セッション識別のため
    const res = await client.request(req, CallToolResultSchema);
    console.log("Tool response:"); // ツールからの応答を表示する前の見出し
    // ツールの実行結果を表示 - contentは配列形式で複数の要素を含む可能性がある
    res.content.forEach((item) => {
      if (item.type === "text") {
        console.log(item.text); // テキスト型のコンテンツはそのまま表示
      } else {
        // テキスト以外のコンテンツタイプの場合（画像やJSONなど）
        console.log(item.type + " content", item); // コンテンツタイプと内容を表示
      }
    });
    console.log("------------------------------"); // 区切り線を表示
  } catch (error) {
    // エラーが発生した場合はコンソールにエラー情報を出力
    console.error("Error calling tool:", error);
  }
}

// セッションを終了するための非同期関数 - ステートフルサーバーとの接続を明示的に終了する
async function terminateSession() {
  // transport が存在しない場合はメッセージを表示して処理を終了
  if (!transport) {
    console.log("No active transport to terminate."); // アクティブなトランスポートがない旨のメッセージ
    return;
  }
  try {
    // transport.terminateSession() メソッドを呼び出し - サーバーにDELETEリクエストを送信してセッションを終了
    await transport.terminateSession();
    console.log("Session terminated."); // セッション終了成功メッセージ
    
    // terminateSession() 完了後、transport のセッションIDがundefinedになっているか確認
    if (!transport.sessionId) {
      console.log("Session ID is now undefined."); // セッションID消去確認メッセージ
      sessionId = undefined; // クライアント側でもセッションIDをクリア - 変数の整合性を保つ
      transport = undefined; // transport インスタンスもクリア - 再接続時に新しいインスタンスを作成するため
    } else {
      // サーバーが DELETE リクエストを正しく処理しなかった場合など - 異常系の処理
      console.log("Session ID is still available. Session termination might have failed.");
      console.log("Session ID:", transport.sessionId); // 残存しているセッションIDを表示
    }
  } catch (error) {
    // セッション終了処理中にエラーが発生した場合
    console.error("Error terminating session:", error);
  }
  console.log("------------------------------"); // 区切り線を表示
}

// クライアントをサーバーに接続し、コマンド入力を待機するメイン関数 - プログラムのエントリーポイント
async function main() {
  try {
    // Streamable HTTP トランスポートを初期化 - MCPサーバーとの通信チャネルを確立
    // 初回接続時は sessionId が undefined なので、SDKは初期化リクエストを送信
    // 一度セッションが確立されると、transport インスタンス内部にサーバーから返されたセッションIDが保持される
    // disconnect や terminateSession でセッションが終了すると、sessionId は undefined に戻る
    transport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${PORT}/mcp`), // サーバーのエンドポイントURLを指定
      {
        sessionId, // 前回のセッション ID (あれば) を設定 - 再接続時に使用
      }
    );

    // サーバーに接続するリクエストを送信 - トランスポートを通じてサーバーとの接続を確立
    await client.connect(transport);

    // サーバーから返されたセッション ID を取得し、変数に格納
    console.log("Connected to stateful server."); // 接続成功メッセージ
    console.log("Session ID:", transport.sessionId); // 発行されたセッションIDを表示
    sessionId = transport.sessionId; // グローバル変数にセッションIDを保存 - 以降のリクエストはこのセッションIDで行われる

    // コマンド入力ループ - ユーザーからのコマンド入力を継続的に処理
    while (true) {
      // 利用可能なコマンドの一覧を表示 - ユーザーが選択できるオプションを提示
      console.log("Available commands:");
      console.log("1. list-tools"); // ツール一覧表示コマンド
      console.log("2. call-tool"); // ツール実行コマンド
      console.log("3. exit"); // クライアント終了コマンド
      console.log("4. terminate-session"); // セッション終了コマンド - ステートフルサーバー特有の機能
      console.log("------------------------------"); // 区切り線
      const answer = await readline.question("Enter your input: "); // ユーザーからの入力を待機

      // 入力されたコマンドに応じて処理を分岐
      switch (answer) {
        case "list-tools":
          await listTools(); // ツール一覧表示関数を呼び出し
          break;
        case "call-tool":
          await callTool(); // ツール実行関数を呼び出し
          break;
        case "terminate-session": // セッション終了コマンド - ステートフルサーバー特有
          await terminateSession(); // セッション終了関数を呼び出し
          break;
        case "exit":
          await disconnect(); // 接続切断関数を呼び出し
          console.log("Disconnected from server."); // 切断完了メッセージ
          return; // メイン関数から抜ける - プログラム終了
        default:
          console.log("You entered:", answer); // 認識されないコマンドの場合、入力内容をそのまま表示
          break;
      }
      // セッションが終了した場合の処理 - セッションIDがundefinedになっているかチェック
      if (!sessionId) {
        console.log("Session ended. Please restart the client to start a new session."); // セッション終了通知
        break; // セッション終了したらループを抜ける - 再接続には再起動が必要
      }
    }
  } catch (error) {
    // セットアップまたはコマンドループ中にエラーが発生した場合
    console.error("Error during setup or command loop:", error);
    await disconnect(); // エラー発生時も切断処理を実行
  } finally {
     readline.close(); // ループを抜けた後もreadlineを閉じる - リソースの解放
     console.log("Client process finishing."); // プロセス終了メッセージ
     // process.exit(0); // 明示的に終了させる必要があればコメントを外す
  }
}

// クライアントとトランスポートの接続を切断する関数 - リソースを適切に解放するためのクリーンアップ処理
async function disconnect() {
  try {
    if (transport) {
      await transport.close(); // トランスポートを閉じる - サーバーとの通信チャネルを終了
      console.log("Transport closed."); // トランスポート終了メッセージ
    }
    await client.close(); // クライアントを閉じる - クライアントリソースを解放
    console.log("Client closed."); // クライアント終了メッセージ
    // readline.close(); // main finally ブロックで閉じるため、ここでは閉じない
    console.log("Disconnected from server."); // 切断完了メッセージ
  } catch (error) {
    // 切断処理中にエラーが発生した場合
    console.error("Error during disconnect:", error);
  } finally {
     // process.exit(0); // main finally ブロックに移動したため、ここでは実行しない
  }
}

// メイン関数を実行 - プログラムの開始点
main().catch((error) => {
  console.error("Fatal error:", error); // 致命的なエラーが発生した場合はコンソールに出力
  // disconnect(); // main finally ブロックに移動したため、ここでは実行しない
});
