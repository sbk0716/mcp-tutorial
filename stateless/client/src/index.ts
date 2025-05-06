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
import { createInterface } from "readline/promises"; // 標準入力を非同期で扱うためのNode.jsモジュール

// サーバーのポート番号を設定 - 環境変数STATELESS_SERVER_PORTが設定されていればその値を使用し、なければデフォルト値3000を使用
const PORT = process.env.STATELESS_SERVER_PORT || 3000;

// Streamable HTTP トランスポートを初期化 - MCPサーバーとの通信チャネルを確立
// ステートレスサーバーへの接続なので、sessionId は undefined に設定（ステートフルな場合はセッションIDが必要）
const transport = new StreamableHTTPClientTransport(
  new URL(`http://localhost:${PORT}/mcp`), // サーバーのエンドポイントURLを指定 - ローカルホスト上の指定ポートにある/mcpパス
  {
    sessionId: undefined, // ステートレス接続を示すためにsessionIdをundefinedに設定
  }
);

// MCP クライアントインスタンスを作成 - サーバーとの通信を管理する中心的なオブジェクト
const client = new Client({
  name: "stateless-client", // クライアントの名前を指定 - サーバー側でクライアントを識別するために使用
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
  try {
    // client.request メソッドでサーバーにリクエストを送信し、応答を待機
    // 第二引数に結果のスキーマを渡すことで、SDKがレスポンスの形式を検証し型安全性を確保
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
    // 第二引数に結果のスキーマを渡して応答の形式を検証
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

// クライアントをサーバーに接続し、コマンド入力を待機するメイン関数 - プログラムのエントリーポイント
async function main() {
  try {
    // サーバーに接続するリクエストを送信 - トランスポートを通じてサーバーとの接続を確立
    await client.connect(transport);
    console.log("Connected to stateless server."); // 接続成功メッセージを表示

    // コマンド入力ループ - ユーザーからのコマンド入力を継続的に処理
    while (true) {
      // 利用可能なコマンドの一覧を表示 - ユーザーが選択できるオプションを提示
      console.log("Available commands:");
      console.log("1. list-tools"); // ツール一覧表示コマンドの説明
      console.log("2. call-tool"); // ツール実行コマンドの説明
      console.log("3. exit"); // クライアント終了コマンドの説明
      console.log("------------------------------"); // 区切り線
      const answer = await readline.question("Enter your input: "); // ユーザーからの入力を待機

      // 入力されたコマンドに応じて処理を分岐
      switch (answer) {
        case "list-tools":
          await listTools(); // ツール一覧表示関数を呼び出し - サーバーから利用可能なツール一覧を取得して表示
          break;
        case "call-tool":
          await callTool(); // ツール実行関数を呼び出し - サイコロツールを実行
          break;
        case "exit":
          await disconnect(); // 接続切断関数を呼び出し - クリーンアップ処理を実行
          console.log("Disconnected from server."); // 切断完了メッセージを表示
          return; // プログラム終了 - メイン関数から抜ける
        default:
          console.log("You entered:", answer); // 認識されないコマンドの場合、入力内容をそのまま表示
          break;
      }
    }
  } catch (error) {
    // セットアップまたはコマンドループ中にエラーが発生した場合
    console.error("Error during setup or command loop:", error);
    // エラー発生時も切断処理を試みる - リソースのクリーンアップを確実に行う
    await disconnect();
  }
}

// クライアントとトランスポートの接続を切断する関数 - リソースを適切に解放するためのクリーンアップ処理
async function disconnect() {
  try {
    if (transport) {
      await transport.close(); // トランスポートを閉じる - サーバーとの通信チャネルを終了
    }
    await client.close(); // クライアントを閉じる - クライアントリソースを解放
    readline.close(); // 標準入力インターフェイスを閉じる - 入力ストリームを解放
    console.log("Disconnected from server."); // 切断完了メッセージを表示
  } catch (error) {
    // 切断処理中にエラーが発生した場合
    console.error("Error during disconnect:", error);
  } finally {
    process.exit(0); // プロセスを正常終了 - 終了コード0は成功を意味する
  }
}

// メイン関数を実行 - プログラムの開始点
main().catch((error) => {
  console.error("Fatal error:", error); // 致命的なエラーが発生した場合はコンソールに出力
  disconnect(); // 重大なエラーの場合も切断処理を実行してリソースを解放
});