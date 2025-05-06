// サーバーのURL - MCPサーバーのエンドポイントを定義（ローカルホスト上のポート3000にある/mcpパス）
const SERVER_URL = 'http://localhost:3000/mcp';

// ツール一覧を取得する非同期関数 - サーバーから利用可能なツールの一覧を取得して表示
async function listTools() {
  // ツール一覧を表示するDOM要素を取得
  const toolsList = document.getElementById('tools-list');
  // 読み込み中の表示を設定
  toolsList.innerHTML = 'ツール一覧を取得中...';
  
  try {
    // fetchを使用してサーバーにPOSTリクエストを送信
    const response = await fetch(SERVER_URL, {
      method: 'POST', // HTTPメソッドをPOSTに設定
      headers: {
        'Content-Type': 'application/json', // リクエストボディがJSON形式であることを指定
        'Accept': 'application/json, text/event-stream'  // JSONとSSE（Server-Sent Events）の両方を受け入れる
      },
      body: JSON.stringify({ // リクエストボディをJSON文字列に変換
        jsonrpc: '2.0', // JSON-RPC 2.0プロトコルを使用
        method: 'tools/list', // 呼び出すメソッド - ツール一覧取得
        params: {}, // パラメータは空オブジェクト - このメソッドでは追加パラメータは不要
        id: 1 // リクエストID - レスポンスとリクエストを紐付けるために使用
      })
    });
    
    // SSEレスポンスを処理 - テキスト形式でレスポンスを取得
    const text = await response.text();
    // デバッグ情報をコンソールに出力
    console.log('【listTools】Raw response:', text); // 生のレスポンステキスト
    console.log('【listTools】Response headers:', Object.fromEntries([...response.headers])); // レスポンスヘッダー
    console.log('【listTools】Content-Type:', response.headers.get('Content-Type')); // Content-Typeヘッダー
    
    // レスポンスがSSE形式かどうかを確認 - 'event:'または'data:'を含む場合はSSE形式
    let data;
    if (text.includes('event:') || text.includes('data:')) {
      console.log('【listTools】Detected SSE format'); // SSE形式を検出したことをログ出力
      // SSEメッセージからJSONデータを抽出 - 'data:'で始まる行を抽出して処理
      const jsonData = text.split('\n') // 改行で分割
        .filter(line => line.startsWith('data:')) // 'data:'で始まる行のみをフィルタリング
        .map(line => line.substring(6).trim()) // 'data:'プレフィックスを削除して整形
        .join(''); // 結合して一つのJSON文字列にする
      
      console.log('【listTools】Extracted JSON data:', jsonData); // 抽出したJSONデータをログ出力
      data = JSON.parse(jsonData); // JSON文字列をJavaScriptオブジェクトにパース
    } else {
      console.log('【listTools】Detected regular JSON format'); // 通常のJSON形式を検出したことをログ出力
      // 通常のJSONレスポンスの場合 - そのままパース
      data = JSON.parse(text);
    }
    console.log('【listTools】Parsed data:', data); // パースしたデータをログ出力
    
    // エラーレスポンスの場合はエラーメッセージを表示
    if (data.error) {
      toolsList.innerHTML = `エラー: ${data.error.message}`;
      return;
    }
    
    // 正常なレスポンスの場合はツール一覧を表示
    if (data.result && data.result.tools) {
      const tools = data.result.tools; // ツール一覧を取得
      if (tools.length === 0) {
        // ツールが存在しない場合のメッセージ
        toolsList.innerHTML = '利用可能なツールはありません。';
      } else {
        // ツールが存在する場合はHTMLを生成して表示
        const toolsHtml = tools.map(tool => 
          `<div class="tool-item">
            <h3>${tool.name}</h3>
            <p>${tool.description}</p>
          </div>`
        ).join(''); // 各ツールのHTMLを生成して結合
        toolsList.innerHTML = toolsHtml; // 生成したHTMLを表示エリアに設定
      }
    }
  } catch (error) {
    // 例外が発生した場合はエラーメッセージを表示
    toolsList.innerHTML = `エラー: ${error.message}`;
  }
}

// サイコロを振る非同期関数 - サーバー上のdiceツールを呼び出してサイコロの結果を表示
async function rollDice() {
  // 入力フィールドと結果表示エリアのDOM要素を取得
  const sidesInput = document.getElementById('sides'); // サイコロの面数入力フィールド
  const diceResult = document.getElementById('dice-result'); // 結果表示エリア
  const sides = parseInt(sidesInput.value); // 入力値を整数に変換
  
  // 入力値のバリデーション - 不正な入力（NaNや1未満の値）をチェック
  if (isNaN(sides) || sides < 1) {
    diceResult.innerHTML = 'エラー: 有効な数値を入力してください。'; // エラーメッセージを表示
    return; // 不正な入力の場合は関数を終了
  }
  
  // 処理中の表示を設定
  diceResult.innerHTML = 'サイコロを振っています...';
  
  try {
    // fetchを使用してサーバーにPOSTリクエストを送信
    const response = await fetch(SERVER_URL, {
      method: 'POST', // HTTPメソッドをPOSTに設定
      headers: {
        'Content-Type': 'application/json', // リクエストボディがJSON形式であることを指定
        'Accept': 'application/json, text/event-stream'  // JSONとSSEの両方を受け入れる
      },
      body: JSON.stringify({ // リクエストボディをJSON文字列に変換
        jsonrpc: '2.0', // JSON-RPC 2.0プロトコルを使用
        method: 'tools/call', // 呼び出すメソッド - ツール実行
        params: {
          name: 'dice', // 呼び出すツールの名前 - サイコロツール
          arguments: { sides } // ツールに渡す引数 - サイコロの面数
        },
        id: 2 // リクエストID - レスポンスとリクエストを紐付けるために使用
      })
    });
    
    // SSEレスポンスを処理 - テキスト形式でレスポンスを取得
    const text = await response.text();
    // デバッグ情報をコンソールに出力
    console.log('【rollDice】Raw response:', text); // 生のレスポンステキスト
    console.log('【rollDice】Response headers:', Object.fromEntries([...response.headers])); // レスポンスヘッダー
    console.log('【rollDice】Content-Type:', response.headers.get('Content-Type')); // Content-Typeヘッダー
    
    // レスポンスがSSE形式かどうかを確認 - 'event:'または'data:'を含む場合はSSE形式
    let data;
    if (text.includes('event:') || text.includes('data:')) {
      console.log('【rollDice】Detected SSE format'); // SSE形式を検出したことをログ出力
      // SSEメッセージからJSONデータを抽出 - 'data:'で始まる行を抽出して処理
      const jsonData = text.split('\n') // 改行で分割
        .filter(line => line.startsWith('data:')) // 'data:'で始まる行のみをフィルタリング
        .map(line => line.substring(6).trim()) // 'data:'プレフィックスを削除して整形
        .join(''); // 結合して一つのJSON文字列にする
      
      console.log('【rollDice】Extracted JSON data:', jsonData); // 抽出したJSONデータをログ出力
      data = JSON.parse(jsonData); // JSON文字列をJavaScriptオブジェクトにパース
    } else {
      console.log('【rollDice】Detected regular JSON format'); // 通常のJSON形式を検出したことをログ出力
      // 通常のJSONレスポンスの場合 - そのままパース
      data = JSON.parse(text);
    }
    console.log('【rollDice】Parsed data:', data); // パースしたデータをログ出力
    
    // エラーレスポンスの場合はエラーメッセージを表示
    if (data.error) {
      diceResult.innerHTML = `エラー: ${data.error.message}`;
      return;
    }
    
    // 正常なレスポンスの場合はサイコロの結果を表示
    if (data.result && data.result.content) {
      const content = data.result.content; // コンテンツ配列を取得
      const textContent = content.find(item => item.type === 'text'); // テキスト型のコンテンツを検索
      if (textContent) {
        // テキストコンテンツが見つかった場合は結果を表示
        diceResult.innerHTML = `<div class="dice-value">${textContent.text}</div>`;
      } else {
        // テキストコンテンツが見つからなかった場合はエラーメッセージを表示
        diceResult.innerHTML = 'サイコロの結果を表示できません。';
      }
    }
  } catch (error) {
    // 例外が発生した場合はエラーメッセージを表示
    diceResult.innerHTML = `エラー: ${error.message}`;
  }
}

// DOMコンテンツが完全に読み込まれた後にイベントリスナーを設定 - ページ読み込み完了時に実行
document.addEventListener('DOMContentLoaded', () => {
  // ツール一覧取得ボタンにクリックイベントリスナーを設定 - クリックするとlistTools関数を実行
  document.getElementById('list-tools-btn').addEventListener('click', listTools);
  // サイコロを振るボタンにクリックイベントリスナーを設定 - クリックするとrollDice関数を実行
  document.getElementById('roll-dice-btn').addEventListener('click', rollDice);
});