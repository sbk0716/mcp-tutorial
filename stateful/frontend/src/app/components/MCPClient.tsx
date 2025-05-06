"use client"; // Next.jsのクライアントコンポーネントであることを宣言 - サーバーサイドではなくブラウザで実行される

// React関連のフックをインポート - コンポーネントの状態管理と副作用処理に使用
import { useState, useEffect } from 'react';
// MCPクライアント関連の関数をインポート - サーバーとの通信を担当
import { 
  initializeClient, // MCPクライアントを初期化する関数
  getSessionId, // 現在のセッションIDを取得する関数
  terminateSession, // セッションを終了する関数
  listTools, // ツール一覧を取得する関数
  rollDice // サイコロを振る関数
} from '../../../lib/mcp-client'; // 相対パスでMCPクライアントライブラリをインポート

// MCPクライアントコンポーネント - ステートフルMCPサーバーとの対話を行うUIを提供
export default function MCPClient() {
  // 状態変数の定義 - ReactのuseStateフックを使用してコンポーネントの状態を管理
  const [sessionId, setSessionId] = useState<string | undefined>(); // 現在のセッションID
  const [tools, setTools] = useState<any[]>([]); // 取得したツール一覧
  const [diceResult, setDiceResult] = useState<string | null>(null); // サイコロの結果
  const [sides, setSides] = useState(6); // サイコロの面数（デフォルト値: 6）
  const [loading, setLoading] = useState(false); // 読み込み中状態
  const [error, setError] = useState<string | null>(null); // エラーメッセージ

  // セッションIDの状態を更新する関数 - 現在のセッション状態をUIに反映
  const updateSessionStatus = () => {
    const currentSessionId = getSessionId(); // MCPクライアントライブラリからセッションIDを取得
    setSessionId(currentSessionId); // 状態を更新してUIに反映
  };

  // コンポーネントマウント時にクライアントを初期化 - ページ読み込み時に一度だけ実行
  useEffect(() => {
    // 非同期初期化関数 - MCPクライアントの初期化処理を実行
    const initialize = async () => {
      setLoading(true); // 読み込み中状態をtrueに設定
      setError(null); // エラー状態をクリア
      try {
        await initializeClient(); // MCPクライアントを初期化
        updateSessionStatus(); // セッション状態を更新
      } catch (err) {
        // エラーが発生した場合はエラーメッセージを設定
        setError(`初期化エラー: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false); // 読み込み中状態をfalseに設定
      }
    };

    initialize(); // 初期化関数を実行
  }, []); // 空の依存配列を指定して初回レンダリング時のみ実行

  // ツール一覧を取得する関数 - ボタンクリック時に実行
  const handleListTools = async () => {
    setLoading(true); // 読み込み中状態をtrueに設定
    setError(null); // エラー状態をクリア
    try {
      const toolsList = await listTools(); // MCPサーバーからツール一覧を取得
      setTools(toolsList); // 取得したツール一覧を状態に設定
    } catch (err) {
      // エラーが発生した場合はエラーメッセージを設定
      setError(`ツール一覧取得エラー: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false); // 読み込み中状態をfalseに設定
    }
  };

  // サイコロを振る関数 - ボタンクリック時に実行
  const handleRollDice = async () => {
    // 入力値のバリデーション - 不正な入力（NaNや1未満の値）をチェック
    if (isNaN(sides) || sides < 1) {
      setError('有効な数値を入力してください'); // エラーメッセージを設定
      return; // 不正な入力の場合は処理を終了
    }

    setLoading(true); // 読み込み中状態をtrueに設定
    setError(null); // エラー状態をクリア
    try {
      const result = await rollDice(sides); // MCPサーバー上のdiceツールを実行
      setDiceResult(result); // 取得した結果を状態に設定
    } catch (err) {
      // エラーが発生した場合はエラーメッセージを設定
      setError(`サイコロエラー: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false); // 読み込み中状態をfalseに設定
    }
  };

  // セッションを終了する関数 - ボタンクリック時に実行
  const handleTerminateSession = async () => {
    setLoading(true); // 読み込み中状態をtrueに設定
    setError(null); // エラー状態をクリア
    try {
      await terminateSession(); // MCPサーバーとのセッションを終了
      updateSessionStatus(); // セッション状態を更新
    } catch (err) {
      // エラーが発生した場合はエラーメッセージを設定
      setError(`セッション終了エラー: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false); // 読み込み中状態をfalseに設定
    }
  };

  // コンポーネントのレンダリング - UIの構造を定義
  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* ページタイトル */}
      <h1 className="text-3xl font-bold mb-8 text-center">MCP Stateful Client</h1>
      
      {/* セッション情報セクション - 現在のセッション状態を表示 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">セッション情報</h2>
        {/* セッション状態表示 - セッションの有無に応じて色を変更 */}
        <div className={`p-3 rounded-md mb-4 ${sessionId 
          ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100' // セッションがある場合は緑色
          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}> {/* セッションがない場合はグレー */}
          {sessionId ? `アクティブなセッション: ${sessionId}` : 'セッションなし'} {/* セッションIDまたは「セッションなし」を表示 */}
        </div>
        {/* セッション終了ボタン - セッションがない場合や読み込み中は無効化 */}
        <button 
          onClick={handleTerminateSession} // クリック時にセッション終了処理を実行
          disabled={!sessionId || loading} // セッションがない場合や読み込み中は無効化
          className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          セッションを終了
        </button>
      </div>
      
      {/* ツール一覧セクション - サーバーから取得したツール一覧を表示 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">ツール一覧</h2>
        {/* ツール一覧取得ボタン - 読み込み中は無効化 */}
        <button 
          onClick={handleListTools} // クリック時にツール一覧取得処理を実行
          disabled={loading} // 読み込み中は無効化
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md disabled:bg-gray-400 disabled:cursor-not-allowed mb-4"
        >
          ツール一覧を取得
        </button>
        {/* ツール一覧表示エリア - 最小高さを設定して表示の安定性を確保 */}
        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md min-h-[100px]">
          {loading && <p className="text-gray-500">ロード中...</p>} {/* 読み込み中表示 */}
          {!loading && tools.length === 0 && <p className="text-gray-500">ツールはありません</p>} {/* ツールがない場合の表示 */}
          {!loading && tools.length > 0 && (
            <div className="space-y-4">
              {/* ツール一覧をマップして表示 - 各ツールの名前と説明を表示 */}
              {tools.map((tool, index) => (
                <div key={index} className="border-b border-gray-200 dark:border-gray-600 pb-3 last:border-0 last:pb-0">
                  <h3 className="font-semibold text-lg">{tool.name}</h3> {/* ツール名 */}
                  <p className="text-gray-600 dark:text-gray-300">{tool.description}</p> {/* ツールの説明 */}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* サイコロツールセクション - サイコロツールを実行するUI */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">サイコロツール</h2>
        {/* サイコロの面数入力フォーム */}
        <div className="mb-4">
          <label htmlFor="sides" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            サイコロの面の数:
          </label>
          <input 
            type="number" 
            id="sides" 
            min="1" // 最小値は1
            value={sides} // 現在の面数
            onChange={(e) => setSides(parseInt(e.target.value))} // 入力値を数値に変換して状態を更新
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>
        {/* サイコロを振るボタン - 読み込み中は無効化 */}
        <button 
          onClick={handleRollDice} // クリック時にサイコロを振る処理を実行
          disabled={loading} // 読み込み中は無効化
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md disabled:bg-gray-400 disabled:cursor-not-allowed mb-4"
        >
          サイコロを振る
        </button>
        {/* サイコロの結果表示エリア - 中央揃えで表示 */}
        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md min-h-[100px] flex items-center justify-center">
          {loading && <p className="text-gray-500">ロード中...</p>} {/* 読み込み中表示 */}
          {!loading && !diceResult && <p className="text-gray-500">サイコロを振ってください</p>} {/* 結果がない場合の表示 */}
          {!loading && diceResult && (
            <div className="text-4xl font-bold text-red-600 dark:text-red-400">{diceResult}</div> // サイコロの結果を大きく表示
          )}
        </div>
      </div>
      
      {/* エラーメッセージ表示 - エラーがある場合のみ表示 */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md mb-6">
          <p>{error}</p> {/* エラーメッセージを表示 */}
        </div>
      )}
    </div>
  );
}