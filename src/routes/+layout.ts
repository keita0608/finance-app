// Cloud Run / Node.js サーバーで動作するため prerender を無効化
// データは API ルートを通じてサーバーサイドで Google Drive から取得する
export const prerender = false;
export const ssr = false;
export const trailingSlash = 'always';
