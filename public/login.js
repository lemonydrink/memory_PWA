const error = new URLSearchParams(location.search).get('error');
document.getElementById('loginStatus').textContent = error === 'denied' ? 'このアカウントには利用許可がありません。管理者に確認してください。' : error ? 'ログインできませんでした。もう一度お試しください。' : '';
// Retire the previous offline app even before the first authenticated visit.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
