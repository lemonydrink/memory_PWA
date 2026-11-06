(async () => {
 const results = [];
 function check(name, condition) { if (!condition) throw new Error(name); results.push(name); }
 try {
  await new Promise(resolve => setTimeout(resolve, 500));
  check('library rendered', document.querySelectorAll('.library-row').length >= 2);
  const notes = parseLesson('# 確認\n\n## 学習\n\n**細胞**です。\n\n## テスト\n\n### 基本単位は？\n\n細胞');
  check('markdown import', notes.length === 2);
  openNote({...notes[0],id:'check',assets:{}});
  check('red terms', reading.querySelector('.term').textContent === '細胞');
  setRaised(true); check('sheet raised', phone.classList.contains('raised'));
  openNote({...notes[1],id:'check-test',assets:{}});
  showAnswer(); check('answer reveal', answerShown);
  const target = document.createElement('div');
  renderBlocks(target, '前文\n\n| 名称 | 数 | 位置 |\n| :--- | ---: | :---: |\n| **核** | 2 | 中央 |\n| a\\|b | 3 | 左 |\n\n後文', true);
  check('table rows', target.querySelectorAll('tbody tr').length === 2);
  check('table red terms', target.querySelector('td .term').textContent === '核');
  check('table alignment', target.querySelectorAll('th')[1].style.textAlign === 'right' && target.querySelectorAll('th')[2].style.textAlign === 'center');
  check('escaped pipe', target.querySelectorAll('tbody tr')[1].firstChild.textContent === 'a|b');
  check('following paragraph', target.lastChild.textContent === '後文');
  renderBlocks(target, '| A | B |\n| --- | --- |\n| **答え** | 画像 |', false);
  check('test table bold', !!target.querySelector('strong') && !target.querySelector('.term'));
  renderBlocks(target, '| A | B |\n通常の文章', true);
  check('ordinary pipes', !target.querySelector('table'));
  showLibrary();
  const db = await storage; check('IndexedDB', !!db);
  await saveLibrary();
  const saved = await new Promise(resolve => {const r = db.transaction('data').objectStore('data').get('library');r.onsuccess=()=>resolve(r.result);});
  check('persisted library', saved.notes.length >= 2);
  const reg = await navigator.serviceWorker.ready; check('service worker', !!reg.active);
  const cache = await caches.open('redsheet-v2'); check('offline shell', !!await cache.match('/app.js'));
  document.body.innerHTML = '<pre id="result">PASS '+results.join(' | ')+'</pre>';
 } catch(e) {document.body.innerHTML='<pre id="result">FAIL '+e.message+'</pre>';}
})();
