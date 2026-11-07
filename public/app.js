
const $ = id => document.getElementById(id);
const phone = $('phone'), grip = $('grip'), reading = $('reading'), drawer = $('drawer');
const menuButton = $('menuButton'), closeButton = $('closeButton'), header = $('header');
const test = $('test'), testBody = $('testBody'), testQuestion = $('testQuestion');
const testAnswer = $('testAnswer'), revealAnswer = $('revealAnswer'), nextQuestion = $('nextQuestion');
const library = $('library'), noteFile = $('noteFile');
const menuItems = [$('openLibrary'), $('openImport')];
let sheetStage = 3, raised = false, drag = null, suppressClick = false, swipe = null;
let questionIndex = 0, answerShown = false, testComplete = false;
let answerSwipe = null, testTransitioning = false, testViewRevision = 0;

const sampleQuestions = [
  {
    question: '生物のからだをつくる基本単位は何？',
    answer: '細胞',
    explanation: '細胞は生物の構造と働きの基本単位です。単細胞生物では、1個の細胞が個体をつくります。'
  },
  {
    question: '真核細胞で、DNAの大部分が収められている場所はどこ？',
    answer: '核',
    explanation: '核には染色体があり、そのDNAに遺伝情報が記録されています。ミトコンドリアなどにも独自のDNAがあります。'
  },
  {
    question: 'アミノ酸をつないでタンパク質を合成する構造は何？',
    answer: 'リボソーム',
    explanation: 'リボソームは、RNAに写し取られた情報を読み取り、その順序に従ってアミノ酸をつなぎます。'
  }
];
let questions = sampleQuestions;

function renderQuestion() {
  const item = questions[questionIndex];
  $('testCount').textContent = testComplete ? questions.length + '問完了' : (questionIndex + 1) + ' / ' + questions.length;
  $('testKicker').textContent = testComplete ? 'おつかれさま' : '問題';
  testQuestion.replaceChildren();
  if(testComplete)testQuestion.textContent='テスト完了';
  else window.redsheetRich.inline(testQuestion,item.question,false,imageURLs);
  test.classList.toggle('is-revealed', answerShown);
  testAnswer.hidden = !answerShown;
  revealAnswer.hidden = answerShown || testComplete;
  nextQuestion.hidden = !answerShown && !testComplete;
  if ($('previousQuestion')) $('previousQuestion').disabled = !testComplete && !answerShown && questionIndex === 0;
  nextQuestion.textContent = testComplete ? 'もう一度' : questionIndex + 1 === questions.length ? 'テストを終える' : '次の問題';
  $('testPromptMedia').hidden = testComplete || !item.prompt;
  renderBlocks($('testPromptMedia'), testComplete ? '' : item.prompt);
  renderBlocks($('testAnswerValue'), answerShown ? item.answer : '');
  renderBlocks($('testExplanationValue'), answerShown ? item.explanation : '');
  $('testExplanation').hidden = !item.explanation;
}

function showAnswer() {
  if (answerShown || testComplete) return;
  answerShown = true;
  renderQuestion();
  testAnswer.classList.add('is-entering');
  $('testAnswerHeading').focus();
}
async function moveTest(direction) {
  if (testTransitioning || phone.dataset.mode !== 'test') return;
  if (direction < 0 && !testComplete && !answerShown && questionIndex === 0) return;
  if (direction > 0 && testComplete) return;
  testTransitioning = true;
  const viewRevision = testViewRevision;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    if (!reduce) await testBody.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:`translateY(${-direction*22}px)`}],{duration:110,easing:'ease-in',fill:'forwards'}).finished;
    if (viewRevision !== testViewRevision) return;
    if (direction > 0) {
      if (!answerShown) answerShown = true;
      else {answerShown = false;if (questionIndex + 1 < questions.length) questionIndex++;else testComplete = true;}
    } else if (testComplete) {testComplete = false;answerShown = true;}
    else if (answerShown) answerShown = false;
    else {questionIndex--;answerShown = true;}
    testAnswer.classList.remove('is-entering');
    renderQuestion();testBody.scrollTop = 0;
    if (!reduce) await testBody.animate([{opacity:0,transform:`translateY(${direction*22}px)`},{opacity:1,transform:'translateY(0)'}],{duration:170,easing:'ease-out',fill:'forwards'}).finished;
    if (viewRevision !== testViewRevision) return;
    (answerShown ? $('testAnswerHeading') : testQuestion).focus({preventScroll:true});
  } finally {
    for (const animation of testBody.getAnimations()) animation.cancel();
    testTransitioning = false;
  }
}
revealAnswer.addEventListener('click', () => moveTest(1));
nextQuestion.addEventListener('click', () => {
  if (testComplete) {questionIndex=0;answerShown=false;testComplete=false;renderQuestion();testBody.scrollTop=0;}
  else moveTest(1);
});
$('previousQuestion').addEventListener('click', () => moveTest(-1));
const testInteractive = 'button,a,input,select,textarea,p,h1,h2,h3,table,img,svg';
test.addEventListener('pointerdown', event => {
  if (event.pointerType === 'touch' || event.button !== 0 || event.isPrimary === false || testTransitioning || event.target.closest(testInteractive)) return;
  answerSwipe = {id:event.pointerId,x:event.clientX,y:event.clientY,time:performance.now()};
  try {test.setPointerCapture(event.pointerId);} catch {}
});
test.addEventListener('pointerup', event => {
  if (answerSwipe?.id !== event.pointerId) return;
  const start=answerSwipe;answerSwipe=null;
  const dy=event.clientY-start.y,dx=Math.abs(event.clientX-start.x);
  if (Math.abs(dy)>=45 && Math.abs(dy)>dx*1.4 && performance.now()-start.time<1200) moveTest(dy<0?1:-1);
});
test.addEventListener('pointercancel', () => {answerSwipe=null;});
// Non-passive touchmove reserves blank-area gestures while text remains natively scrollable.
let testTouch = null;
test.addEventListener('touchstart', event => {
  testTouch = null;
  if (event.touches.length !== 1 || testTransitioning || event.target.closest(testInteractive)) return;
  const touch=event.touches[0];
  testTouch={id:touch.identifier,x:touch.clientX,y:touch.clientY,time:performance.now()};
},{passive:true});
test.addEventListener('touchmove', event => {
  if (!testTouch) return;
  if (event.touches.length !== 1) {testTouch=null;return;}
  const touch=event.touches[0],dy=Math.abs(touch.clientY-testTouch.y),dx=Math.abs(touch.clientX-testTouch.x);
  if (dy>8 && dy>dx*1.4 && event.cancelable) event.preventDefault();
},{passive:false});
test.addEventListener('touchend', event => {
  if (!testTouch) return;
  const start=testTouch;testTouch=null;
  const touch=[...event.changedTouches].find(t=>t.identifier===start.id);if(!touch)return;
  const dy=touch.clientY-start.y,dx=Math.abs(touch.clientX-start.x);
  if (Math.abs(dy)>=45 && Math.abs(dy)>dx*1.4 && performance.now()-start.time<1200) moveTest(dy<0?1:-1);
},{passive:true});
test.addEventListener('touchcancel',()=>{testTouch=null;},{passive:true});
test.addEventListener('keydown', event => {
  if (event.target.closest('button,a,input,textarea,select')) return;
  if (event.key==='ArrowUp'||event.key==='ArrowDown') {event.preventDefault();moveTest(event.key==='ArrowUp'?1:-1);}
});
function sheetStops() {
  const high = Math.min(phone.clientHeight - 64, header.offsetTop + header.offsetHeight + 12);
  const safeBottom = parseFloat(getComputedStyle(phone).getPropertyValue('--safe-bottom')) || 0;
  const low = Math.max(high, phone.clientHeight - 60 - safeBottom);
  return Array.from({length:4}, (_,index) => high + (low-high)*index/3);
}
function setSheetStage(value) {
  sheetStage = Math.max(0,Math.min(3,Math.round(value)));
  raised = sheetStage < 3;
  phone.classList.toggle('raised',raised);
  phone.style.setProperty('--sheet-top',sheetStops()[sheetStage]+'px');
  grip.setAttribute('role','slider');
  grip.setAttribute('aria-label','赤シートの位置');
  grip.removeAttribute('aria-pressed');
  grip.setAttribute('aria-valuemin','0');grip.setAttribute('aria-valuemax','3');
  grip.setAttribute('aria-valuenow',String(3-sheetStage));
  grip.setAttribute('aria-valuetext',`下から${4-sheetStage}段階目（全4段階）`);
  grip.setAttribute('aria-orientation','vertical');
}
function setRaised(value) { setSheetStage(value ? 0 : 3); }
grip.addEventListener('pointerdown',event => {
  if(event.button!==0 || event.isPrimary===false || drag)return;
  suppressClick=false;
  const stops=sheetStops();
  drag={id:event.pointerId,y:event.clientY,start:grip.offsetTop,stops,moved:false};
  try{grip.setPointerCapture(event.pointerId);}catch{}
});
grip.addEventListener('pointermove',event => {
  if(!drag || event.pointerId!==drag.id)return;
  const dy=event.clientY-drag.y;
  if(Math.abs(dy)<5&&!drag.moved)return;
  drag.moved=true;phone.classList.add('dragging');
  phone.style.setProperty('--drag-top',Math.max(drag.stops[0],Math.min(drag.stops[3],drag.start+dy))+'px');
});
function finishGrip(event) {
  if(!drag || event.pointerId!==drag.id)return;
  const current=drag;drag=null;
  if(current.moved){
    suppressClick=true;
    if(event.type==='pointerup'){
      const target=current.start+event.clientY-current.y;
      const nearest=current.stops.reduce((best,stop,index)=>Math.abs(stop-target)<Math.abs(current.stops[best]-target)?index:best,0);
      setSheetStage(nearest);
    } else setSheetStage(sheetStage);
  }
  phone.classList.remove('dragging');
}
grip.addEventListener('pointerup',finishGrip);
grip.addEventListener('pointercancel',finishGrip);
grip.addEventListener('lostpointercapture',event=>{if(drag?.id===event.pointerId)finishGrip(event);});
grip.addEventListener('click',event=>{if(event.detail===0||!suppressClick)setSheetStage(sheetStage===0?3:sheetStage-1);});
grip.addEventListener('keydown',event=>{
  const stage={ArrowUp:sheetStage-1,ArrowDown:sheetStage+1,Home:0,End:3}[event.key];
  if(stage===undefined)return;event.preventDefault();setSheetStage(stage);
});
new ResizeObserver(()=>{
  drag=null;phone.classList.remove('dragging');setSheetStage(sheetStage);
}).observe(phone);

function menu(open) {
  if (open && (window.redsheetSyncBusy || deletingNote)) return;
  phone.classList.toggle('menu-open', open);
  drawer.inert = !open;
  reading.inert = header.inert = grip.inert = test.inert = library.inert = open;
  menuButton.setAttribute('aria-expanded', String(open));
  (open ? closeButton : menuButton).focus({preventScroll:true});
}
menuButton.addEventListener('click', () => menu(true));
for (const id of ['closeButton','scrim']) $(id).addEventListener('click', () => menu(false));
menuItems[0].addEventListener('click', () => showLibrary());
menuItems[1].addEventListener('click', chooseFile);
document.addEventListener('keydown', event => {
  if (drawer.inert) return;
  if (event.key === 'Escape') menu(false);
  if (event.key === 'Tab') {
    event.preventDefault();
    const controls = [closeButton, ...menuItems];
    const direction = event.shiftKey ? -1 : 1;
    const current = controls.indexOf(document.activeElement);
    controls[(current + direction + controls.length) % controls.length].focus();
  }
});
phone.addEventListener('pointerdown', event => {
  if (event.button !== 0 || event.target.closest('button')) return;
  const opened = !drawer.inert;
  const activeContent = {library,test,learn:reading}[phone.dataset.mode];
  if (opened ? !drawer.contains(event.target) : event.clientX - phone.getBoundingClientRect().left > 45 || !activeContent.contains(event.target)) return;
  swipe = { id:event.pointerId, x:event.clientX, y:event.clientY, opened };
});
phone.addEventListener('pointermove', event => {
  if (!swipe || event.pointerId !== swipe.id) return;
  const dx = event.clientX - swipe.x, dy = Math.abs(event.clientY - swipe.y);
  if (dy > 20 && dy >= Math.abs(dx)) { swipe = null; return; }
  if (Math.abs(dx) > 50 && Math.abs(dx) > dy * 1.4 && (dx > 0) !== swipe.opened) {
    menu(!swipe.opened);
    swipe = null;
  }
});
function finishSwipe(event) { if (swipe?.id === event.pointerId) swipe = null; }
phone.addEventListener('pointerup', finishSwipe);
phone.addEventListener('pointercancel', finishSwipe);

const sampleArticle = reading.querySelector('article').cloneNode(true);
const initialLibrary = {
  folders: [
    {id:'biology', parent:'', name:'生物基礎'},
    {id:'cells', parent:'biology', name:'細胞のしくみ'}
  ],
  notes: [
    {id:'sample-reading', folder:'cells', kind:'learn', name:'細胞の構造と働き', sample:true},
    {id:'sample-test', folder:'cells', kind:'test', name:'細胞の確認問題', questions:sampleQuestions}
  ]
};
let catalog = initialLibrary, folderId = 'cells', activeNote = null, imageURLs = new Map();
const noteStates = new Map();
const editor = $('libraryEditor'), statusLine = $('libraryStatus');
let pendingImport = false, libraryRevision = 0, deletingNote = false;

function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

const imagePattern = /!\[([^\]\n]*)\]\((?:<([^>\n]+)>|([^()\n]+))\)/g;
// Split unescaped pipes; optional outer pipes are accepted.
function tableCells(line) {
  const cells = []; let cell = '', math = false;
  for (let i = 0; i < line.length; i++) {
    if(line[i]==='$'&&line[i-1]!=='\\'){math=!math;cell+=line[i];}
    else if (line[i] === '\\' && line[i + 1] === '|') { cell += math?'\\|':'|'; i++; }
    else if (line[i] === '|' && !math) { cells.push(cell.trim()); cell = ''; }
    else cell += line[i];
  }
  cells.push(cell.trim());
  if (line.trim().startsWith('|')) cells.shift();
  if (/(?<!\\)\|\s*$/.test(line)) cells.pop();
  return cells;
}

function renderBlocks(container, source, redact = false) {
  container.replaceChildren();
  if (!source) return;
  function appendLine(parent,text) {window.redsheetRich.inline(parent,text,redact,imageURLs);}
  let paragraph = null;
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const fence=/^\s{0,3}```([a-z]*)\s*$/i.exec(line);
    if(fence){
      paragraph=null;const parts=[];let closed=false;
      while(++index<lines.length){if(/^\s{0,3}```\s*$/.test(lines[index])){closed=true;break;}parts.push(lines[index]);}
      const content=parts.join('\n');
      if(fence[1].toLowerCase()==='mermaid'&&closed)window.redsheetRich.diagram(container,content,redact);
      else {const pre=node('pre','code-block',content);container.append(pre);}
      continue;
    }
    if(/^\s*\$\$/.test(line)){
      paragraph=null;let content=line.trimStart().slice(2),end=content.indexOf('$$');
      while(end<0&&index+1<lines.length){content+='\n'+lines[++index];end=content.indexOf('$$');}
      if(end>=0)window.redsheetRich.math(container,content.slice(0,end),true,redact);
      else container.append(node('pre','rich-error','数式の閉じる $$ がありません：'+content));
      continue;
    }
    const headers = tableCells(line);
    const separators = tableCells(lines[index + 1] || '');
    if (line.includes('|') && headers.length > 0 && headers.length === separators.length &&
        separators.every(cell => /^:?-{3,}:?$/.test(cell))) {
      paragraph = null;
      const wrapper = node('div', 'note-table-scroll');
      wrapper.tabIndex = 0;
      wrapper.setAttribute('role', 'region');
      wrapper.setAttribute('aria-label', '教材の表（横スクロール可能）');
      const table = node('table', 'note-table');
      const head = node('thead'), body = node('tbody');
      function appendRow(values, target, header = false) {
        const row = node('tr');
        headers.forEach((_, column) => {
          const cell = node(header ? 'th' : 'td');
          if (header) cell.scope = 'col';
          const marker = separators[column];
          if (marker.endsWith(':')) cell.style.textAlign = marker.startsWith(':') ? 'center' : 'right';
          else cell.style.textAlign = 'left';
          appendLine(cell, values[column] || '');
          row.append(cell);
        });
        target.append(row);
      }
      appendRow(headers, head, true);
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        appendRow(tableCells(lines[index]), body);
        index++;
      }
      index--;
      table.append(head, body); wrapper.append(table); container.append(wrapper);
      continue;
    }
    const heading = /^#{3,6}[ \t]+(.+)$/.exec(line);
    if (heading) {
      paragraph = null;
      const title = node('h2');
      appendLine(title, heading[1]);
      container.append(title);
    } else if (!line.trim()) {
      paragraph = null;
    } else {
      if (!paragraph) {
        paragraph = node('p');
        container.append(paragraph);
      } else {
        paragraph.append(' ');
      }
      appendLine(paragraph, line);
    }
  }
}

function button(text, className, handler) {
  const control = node('button', className, text);
  control.type = 'button';
  control.addEventListener('click', handler);
  return control;
}
function folderPath(id) {
  const path = [];
  for (let folder = catalog.folders.find(item => item.id === id); folder;
       folder = catalog.folders.find(item => item.id === folder.parent)) path.unshift(folder);
  return path;
}
function renderLibrary() {
  const path = $('libraryPath'), list = $('libraryList');
  path.replaceChildren();
  list.replaceChildren();
  const locations = [{id:'',name:'すべて'}, ...folderPath(folderId)];
  for (const [index, item] of locations.entries()) {
    if (index) path.append(node('span', '', '›'));
    const crumb = index === locations.length - 1
      ? node('span', '', item.name)
      : button(item.name, '', () => openFolder(item.id));
    if (index === locations.length - 1) crumb.setAttribute('aria-current','page');
    path.append(crumb);
  }
  for (const folder of catalog.folders.filter(item => item.parent === folderId)) {
    const row = node('div','library-row');
    const open = button('', 'library-row-main', () => openFolder(folder.id));
    open.append(node('span','',folder.name),node('span','library-kind','フォルダ'),node('span','','›'));
    row.append(open);
    list.append(row);
  }
  for (const note of catalog.notes.filter(item => item.folder === folderId)) {
    const row = node('div','library-row');
    const open = button('', 'library-row-main', () => openNote(note));
    open.append(node('span','',note.name),node('span',note.kind === 'test' ? 'library-kind test-kind' : 'library-kind',note.kind === 'test' ? 'テスト' : '赤シート'));
    const more = button('…','library-more',() => editLibraryItem(note));
    more.setAttribute('aria-label',note.name + 'の名前と場所を編集');
    row.append(open,more);
    list.append(row);
  }
  if (!list.childElementCount) list.append(node('p','library-empty','ファイルを読み込むと、ここにノートが表示されます。'));
}
function openFolder(id) {
  folderId = id;
  editor.replaceChildren();
  statusLine.textContent = '';
  renderLibrary();
  library.scrollTop = 0;
}
function updateMode(mode, title) {
  phone.dataset.mode = mode;
  library.hidden = mode !== 'library';
  if ($('uploadView')) $('uploadView').hidden = mode !== 'upload';
  test.hidden = mode !== 'test';
  menuItems[0].setAttribute('aria-current',String(mode === 'library'));
  $('modeTitle').textContent = title;
}
function leaveNote() {
  testViewRevision++;
  if (!activeNote) return;
  noteStates.set(activeNote.id, {
    scroll:activeNote.kind === 'learn' ? reading.scrollTop : testBody.scrollTop,
    sheetStage, raised, questionIndex, answerShown, testComplete
  });
  for (const url of imageURLs.values()) URL.revokeObjectURL(url);
  imageURLs.clear();
  activeNote = null;
}
function showLibrary() {
  leaveNote();
  updateMode('library','暗記ノート');
  renderLibrary();
  menu(false);
  $('libraryTitle').focus({preventScroll:true});
}
function openNote(note) {
  leaveNote();
  activeNote = note;
  const state = noteStates.get(note.id);
  imageURLs = new Map(Object.entries(note.assets || {}).map(([path, blob]) => [path, URL.createObjectURL(blob)]));
  updateMode(note.kind, note.kind === 'test' ? 'テスト' : '赤シートで暗記');
  if (note.kind === 'learn') {
    const article = sampleArticle.cloneNode(true);
    article.querySelector('h1').textContent = note.name;
    if (!note.sample) {
      const body = node('section');
      renderBlocks(body, note.body, true);
      article.replaceChildren(article.querySelector('h1'),article.querySelector('.intro'),body,node('p','end','ノートの終わり'));
    }
    reading.replaceChildren(article);
    setSheetStage(state?.sheetStage ?? (state?.raised ? 0 : 3));
    reading.scrollTop = state?.scroll ?? 0;
  } else {
    $('testNoteName').textContent = note.name;
    questions = note.questions;
    questionIndex = state?.questionIndex ?? 0;
    answerShown = state?.answerShown ?? false;
    testComplete = state?.testComplete ?? false;
    testAnswer.classList.remove('is-entering');
    renderQuestion();
    testBody.scrollTop = state?.scroll ?? 0;
  }
  menu(false);
}

function uniqueId() {
  return crypto.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2));
}
async function deleteNote(note) {
  if(deletingNote || pendingImport || window.redsheetSyncBusy){statusLine.textContent='処理が終わってから削除してください。';return;}
  if(!catalog.notes.some(item=>item.id===note.id))return;
  if(!confirm(`「${note.name}」を削除しますか？\nこの端末からノートと付属画像を削除します。必要なら先にバックアップを保存してください。\nクラウドへの反映は「クラウドと同期」で行います。`))return;
  deletingNote=true;library.inert=true;menuButton.disabled=true;libraryRevision++;
  let deleted=false;
  try{
    const db=await storage;if(!db)throw new Error('保存領域を開けません。');
    const next={...catalog,notes:catalog.notes.filter(item=>item.id!==note.id)};
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('data','readwrite');
      tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('保存に失敗しました。'));
      tx.objectStore('data').put(next,'library:'+window.redsheetUser.sub);
    });
    if(activeNote?.id===note.id)leaveNote();
    catalog=next;noteStates.delete(note.id);editor.replaceChildren();renderLibrary();
    statusLine.textContent='「'+note.name+'」を削除しました。クラウドへ反映するには同期してください。';
    window.dispatchEvent(new Event('redsheet-library-change'));
    deleted=true;
  }catch{statusLine.textContent='削除を保存できませんでした。ノートは保持しています。';}
  finally{deletingNote=false;library.inert=false;menuButton.disabled=false;if(deleted)$('libraryTitle').focus({preventScroll:true});}
}
function editLibraryItem(note) {
  const form = node('form','library-editor');
  const title = node('h2','',note ? 'ノートの整理' : 'フォルダを作る');
  const nameLabel = node('label','','名前');
  nameLabel.htmlFor = 'editName';
  const nameInput = node('input');
  nameInput.id = 'editName';
  nameInput.required = true;
  nameInput.maxLength = 100;
  nameInput.value = note?.name || '';
  form.append(title,nameLabel,nameInput);
  const destination = node('select');
  if (note) {
    const label = node('label','','保存先');
    label.htmlFor = 'editDestination';
    destination.id = 'editDestination';
    for (const folder of [{id:''}, ...catalog.folders]) {
      const option = node('option','',folder.id ? folderPath(folder.id).map(item => item.name).join(' › ') : 'すべて');
      option.value = folder.id;
      destination.append(option);
    }
    destination.value = note.folder;
    form.append(label,destination);
  }
  const actions = node('div','library-editor-actions');
  const cancel = button('キャンセル','library-button secondary',() => editor.replaceChildren());
  const submit = node('button','library-button','保存');
  submit.type = 'submit';
  if(note){const remove=button('ノートを削除','library-button danger',()=>deleteNote(note));remove.setAttribute('aria-label','「'+note.name+'」を削除');actions.append(remove);}
  actions.append(cancel,submit);
  form.append(actions);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    if (note) {
      note.name = name;
      note.folder = destination.value;
    } else {
      catalog.folders.push({id:uniqueId(), parent:folderId, name});
    }
    editor.replaceChildren();
    statusLine.textContent = note ? 'ノートを更新しました。' : 'フォルダを作成しました。';
    renderLibrary();
    saveLibrary();
  });
  editor.replaceChildren(form);
  nameInput.focus();
}
$('newFolder').addEventListener('click', () => editLibraryItem());

function chooseFile() { window.redsheetShowUpload?.(); }
$('libraryImport').addEventListener('click', chooseFile);

function markdownStructure(source) {
  let fence=false,math=false;
  return source.split('\n').map(line=>{
    if(/^\s{0,3}```/.test(line)){fence=!fence;return ' '.repeat(line.length);}
    if(fence)return ' '.repeat(line.length);
    if(/^\s*\$\$/.test(line)){if((line.match(/\$\$/g)||[]).length===1)math=!math;return ' '.repeat(line.length);}
    return math?' '.repeat(line.length):line;
  }).join('\n');
}
function parseLesson(source) {
  const text = source.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
  const title = /^# +([^\n]+)\n/.exec(text)?.[1].trim();
  if (!title) throw new Error('先頭に「# ノート名」を書いてください。');
  const sections = [...markdownStructure(text).matchAll(/^## +(.+)$/gm)];
  const names = sections.map(section => section[1].trim());
  if (!names.length || names.some(name => name !== '学習' && name !== 'テスト') || new Set(names).size !== names.length)
    throw new Error('「## 学習」「## テスト」の少なくとも一方を1回ずつ使ってください。');
  const notes = [];
  for (const [index, section] of sections.entries()) {
    const body = text.slice(section.index + section[0].length, sections[index + 1]?.index).trim();
    if (names[index] === '学習') {
      if (!body) throw new Error('「学習」に本文を入れてください。');
      notes.push({kind:'learn',name:title,body});
      continue;
    }
    const parts = [...markdownStructure(body).matchAll(/^### +(.+)$/gm)];
    if (!parts.length || body.slice(0,parts[0].index).trim())
      throw new Error('「テスト」は「### 質問文」から始めてください。');
    const questions = parts.map((part, number) => {
      const question = part[1].trim();
      const detail = body.slice(part.index + part[0].length,parts[number + 1]?.index).trim();
      const markers = [...markdownStructure(detail).matchAll(/^#### +(問題|答え|解説)[ \t]*$/gm)];
      const markerNames = markers.map(marker => marker[1]).join('/');
      const splitPrompt = markerNames === '問題/答え' || markerNames === '問題/答え/解説';
      if (markerNames && !splitPrompt && markerNames !== '解説')
        throw new Error('問題、答え、解説の見出しの順を確認してください。');
      const block = index => detail.slice(markers[index].index + markers[index][0].length,markers[index + 1]?.index).trim();
      if (splitPrompt && detail.slice(0,markers[0].index).trim())
        throw new Error('質問の補足は「#### 問題」の下に書いてください。');
      const prompt = splitPrompt ? block(0) : '';
      const answer = splitPrompt ? block(1) : detail.slice(0,markers[0]?.index).trim();
      const explanation = markerNames.endsWith('解説') ? block(markers.length - 1) : '';
      if (!question || !answer) throw new Error('各質問に答えを入れてください。');
      return {question,prompt,answer,explanation};
    });
    notes.push({kind:'test',name:sections.length > 1 ? title + 'の確認問題' : title,questions});
  }
  return notes;
}

const maxFileBytes = 24 * 1024 * 1024;
const utf8 = new TextDecoder('utf-8',{fatal:true});
function validAssetPath(path) {
  return /^assets\/.+\.(png|jpe?g)$/i.test(path) &&
    !path.includes('\\') && path.split('/').every(part => part && part !== '.' && part !== '..');
}
async function readZip(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const u16 = offset => view.getUint16(offset,true);
  const u32 = offset => view.getUint32(offset,true);
  const invalid = () => new Error('ZIPの構造を読み込めません。');
  let end = bytes.length - 22;
  const limit = Math.max(0,end - 65535);
  while (end >= limit && (u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== bytes.length)) end--;
  if (end < limit || u16(end + 4) || u16(end + 6) || u16(end + 8) !== u16(end + 10)) throw invalid();
  const directory = u32(end + 16), directoryEnd = directory + u32(end + 12);
  const count = u16(end + 10);
  if (directoryEnd > end || count > 2048) throw invalid();
  const entries = new Map();
  let cursor = directory, expanded = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > directoryEnd || u32(cursor) !== 0x02014b50) throw invalid();
    const nameSize = u16(cursor + 28);
    const next = cursor + 46 + nameSize + u16(cursor + 30) + u16(cursor + 32);
    if (next > directoryEnd) throw invalid();
    let name;
    try { name = utf8.decode(bytes.subarray(cursor + 46,cursor + 46 + nameSize)); } catch {}
    if (name === 'note.redsheet.md' || (name && validAssetPath(name))) {
      const method = u16(cursor + 10), size = u32(cursor + 24), compressed = u32(cursor + 20);
      const local = u32(cursor + 42);
      if (entries.has(name) || (u16(cursor + 8) & 1) || ![0,8].includes(method) ||
          local + 30 > directory || u32(local) !== 0x04034b50) throw invalid();
      const start = local + 30 + u16(local + 26) + u16(local + 28);
      if (start + compressed > directory) throw invalid();
      expanded += size;
      if (expanded > maxFileBytes) throw new Error('ZIP内の教材と画像を合わせて24 MB以内にしてください。');
      entries.set(name,{method,size,start,compressed});
    }
    cursor = next;
  }
  async function read(name) {
    const entry = entries.get(name);
    if (!entry) throw new Error(name + ' がZIPに入っていません。');
    const {method,size,start,compressed} = entry;
    const data = bytes.subarray(start,start + compressed);
    if (method === 0) {
      if (data.length !== size) throw invalid();
      return data;
    }
    let decoder;
    try { decoder = new DecompressionStream('deflate-raw'); }
    catch { throw new Error('このブラウザで圧縮ZIPを展開できません。'); }
    const reader = new Blob([data]).stream().pipeThrough(decoder).getReader();
    const result = new Uint8Array(size);
    let offset = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (offset + chunk.value.length > size) throw invalid();
        result.set(chunk.value,offset);
        offset += chunk.value.length;
      }
      if (offset !== size) throw invalid();
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    return result;
  }
  return {markdown:utf8.decode(await read('note.redsheet.md')),read};
}
async function readLesson(file) {
  if (file.size > maxFileBytes) throw new Error('24 MB以内の教材を選んでください。');
  const zipped = /\.zip$/i.test(file.name);
  if (!zipped && !/\.md$/i.test(file.name)) throw new Error('MarkdownまたはZIPを選んでください。');
  const archive = zipped ? await readZip(file) : null;
  const notes = parseLesson(archive?.markdown ?? utf8.decode(await file.arrayBuffer()));
  const loaded = new Map();
  for (const note of notes) {
    const sources = note.kind === 'learn'
      ? [note.body]
      : note.questions.flatMap(item => [item.prompt,item.answer,item.explanation]);
    const assets = Object.create(null);
    for (const source of sources) {
      for (const match of source.matchAll(imagePattern)) {
        const path = (match[2] ?? match[3]).trim();
        if (!archive || !validAssetPath(path)) throw new Error('画像はZIPにまとめ、assets/ 配下のPNGまたはJPEGを参照してください。');
        if (!loaded.has(path)) {
          const data = await archive.read(path);
          const png = /\.png$/i.test(path);
          const signature = png ? [137,80,78,71,13,10,26,10] : [255,216,255];
          if (!signature.every((byte,index) => data[index] === byte)) throw new Error(path + ' の画像形式を確認してください。');
          loaded.set(path,new Blob([data],{type:png ? 'image/png' : 'image/jpeg'}));
        }
        assets[path] = loaded.get(path);
      }
    }
    note.assets = assets;
  }
  return notes;
}
noteFile.addEventListener('change', async () => {
  const file = noteFile.files[0];
  noteFile.value = '';
  if (!file || pendingImport) return;
  const destination = folderId;
  pendingImport = true;
  statusLine.textContent = '教材を読み込んでいます…';
  try {
    const notes = await readLesson(file);
    for (const note of notes) catalog.notes.push({...note,id:uniqueId(),folder:destination});
    statusLine.textContent = notes.length + '件のノートを「' + (folderPath(destination).at(-1)?.name ?? 'すべて') + '」に読み込みました。';
    renderLibrary();
    await saveLibrary();
    showLibrary();
  } catch (error) {
    statusLine.textContent = '読み込めませんでした（' + (error instanceof Error ? error.message : 'ファイルを確認してください。') + '）';
  } finally {
    pendingImport = false;
  }
});

function openStorage() {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open('redsheet-pwa',1);
    request.onupgradeneeded = () => request.result.createObjectStore('data');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('保存領域を開けません。'));
  });
}
const storage = openStorage().catch(() => null);
storage.then(db => {
  if (!db) return;
  const request = db.transaction('data').objectStore('data').get('library:' + window.redsheetUser.sub);
  request.onsuccess = () => {
    if (libraryRevision || !request.result) return;
    catalog = request.result;
    renderLibrary();
  };
});
async function offerLegacyImport(db) {
  if (!db) return;
  const legacy = await new Promise(resolve => {
    const request = db.transaction('data').objectStore('data').get('library');
    request.onsuccess = () => resolve(request.result); request.onerror = () => resolve(null);
  });
  if (!legacy) return;
  const adopt = button('認証追加前の教材を取り込む','library-button secondary',async () => {
    if (!confirm('この端末に保存されている認証追加前の教材を、現在のアカウントへコピーします。現在のアカウントの教材は置き換わります。先にバックアップを保存してください。')) return;
    try {
      const tx = db.transaction('data','readwrite');
      await new Promise((resolve,reject) => {
        tx.oncomplete = resolve; tx.onabort = reject;
        tx.objectStore('data').put(legacy,'library:' + window.redsheetUser.sub);
      });
      libraryRevision++; catalog = structuredClone(legacy); folderId = ''; noteStates.clear(); renderLibrary();
      statusLine.textContent = '以前の教材をコピーしました。元データも端末内に保持しています。';window.dispatchEvent(new Event('redsheet-library-change'));
    } catch {statusLine.textContent = '教材を取り込めませんでした。';}
  });
  $('newFolder').after(adopt);
}
storage.then(offerLegacyImport).catch(() => {});
async function saveLibrary() {
  libraryRevision++;
  try {
    const db = await storage;
    if (!db) throw new Error();
    const transaction = db.transaction('data','readwrite');
    await new Promise((resolve,reject) => {
      transaction.oncomplete = resolve;
      transaction.onabort = reject;
      transaction.objectStore('data').put(catalog,'library:' + window.redsheetUser.sub);
    });
  } catch {
    statusLine.textContent += ' このブラウザではノートを次回まで保存できません。';
  } finally {window.dispatchEvent(new Event('redsheet-library-change'));}
}
renderLibrary();



function downloadFile(blob, name) {
 const url = URL.createObjectURL(blob);
 const link = document.createElement('a'); link.href = url; link.download = name; link.click();
 setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const toolsBar = node('div','library-editor-actions');
const restoreInput = node('input'); restoreInput.type = 'file'; restoreInput.accept = '.json'; restoreInput.hidden = true;
toolsBar.append(button('バックアップ保存','library-button secondary',async () => {
 try {
  const copy = (await encodeBackup(catalog)).library;
  downloadFile(new Blob([JSON.stringify({format:'redsheet-local-backup',version:1,createdAt:new Date().toISOString(),library:copy})],{type:'application/json'}),'redsheet-backup.json');
 } catch { statusLine.textContent = 'バックアップを保存できませんでした。'; }
}),button('復元','library-button secondary',() => restoreInput.click()),restoreInput);
$('newFolder').after(toolsBar);
restoreInput.addEventListener('change',async () => {
 const file = restoreInput.files[0]; restoreInput.value = ''; if (!file) return;
 try {
  if (file.size > 50 * 1024 * 1024) throw new Error('50 MB以内のファイルを選んでください。');
  const data = JSON.parse(await file.text()); const lib = await decodeBackup(data);
  if (!confirm(`${data.createdAt}\n${lib.notes.length}件のノートで現在の全データを置き換えます。先にバックアップ保存したことを確認してください。`)) return;
  const db = await storage; if (!db) throw new Error('保存領域を開けません。');
  await new Promise((resolve,reject) => {
   const tx = db.transaction('data','readwrite'); tx.oncomplete = resolve; tx.onabort = () => reject(new Error('保存に失敗しました。'));
   tx.objectStore('data').put(lib,'library:' + window.redsheetUser.sub);
  });
  libraryRevision++; catalog = lib; folderId = ''; noteStates.clear(); renderLibrary(); statusLine.textContent = '復元しました。';window.dispatchEvent(new Event('redsheet-library-change'));
 } catch(error) { statusLine.textContent = '復元できませんでした：' + error.message; }
});

async function encodeBackup(library) {
  const copy = structuredClone(library);
  for (const note of copy.notes) {if(note.kind==='test')note.questions=note.questions.map(q=>({...q,prompt:q.prompt||'',explanation:q.explanation||''}));}
  for (const note of copy.notes) for (const [path, blob] of Object.entries(note.assets || {})) {
   note.assets[path] = await new Promise((resolve,reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
   });
  }

 return {format:'redsheet-local-backup',version:1,createdAt:new Date().toISOString(),library:copy};
}
async function decodeBackup(data) {
 const lib = structuredClone(data.library);
  if (data.format !== 'redsheet-local-backup' || data.version !== 1 || !Array.isArray(lib?.folders) || !Array.isArray(lib?.notes)) throw new Error('形式が違います。');
  const ids = new Set(['']);
  for (const f of lib.folders) {
   if (typeof f.id !== 'string' || !f.id || ids.has(f.id) || typeof f.name !== 'string' || typeof f.parent !== 'string') throw new Error('フォルダ情報が不正です。');
   ids.add(f.id);
  }
  for (const f of lib.folders) {
   const visited = new Set([f.id]); let parent = f.parent;
   while (parent) {
    if (!ids.has(parent) || visited.has(parent)) throw new Error('フォルダ階層が不正です。');
    visited.add(parent); parent = lib.folders.find(x => x.id === parent).parent;
   }
  }
  const noteIds = new Set();
  for (const n of lib.notes) {
   if (typeof n.id !== 'string' || noteIds.has(n.id) || typeof n.name !== 'string' || !ids.has(n.folder)) throw new Error('ノート情報が不正です。');
   noteIds.add(n.id);
   if (n.kind === 'learn') {if (!n.sample && typeof n.body !== 'string') throw new Error('本文がありません。');}
   else if (n.kind === 'test') {
    if (!Array.isArray(n.questions) || !n.questions.length || n.questions.some(q => !q || ['question','answer','prompt','explanation'].some(k => typeof q[k] !== 'string'))) throw new Error('問題情報が不正です。');
   } else throw new Error('ノートの種類が不正です。');
   for (const [path,value] of Object.entries(n.assets || {})) {
    if (!validAssetPath(path) || typeof value !== 'string' || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value)) throw new Error('画像情報が不正です。');
    n.assets[path] = await (await fetch(value)).blob();
   }
   const sources = n.kind === 'learn' ? [n.body || ''] : n.questions.flatMap(q => [q.prompt,q.answer,q.explanation]);
   for (const source of sources) for (const m of source.matchAll(imagePattern)) if (!n.assets?.[(m[2] ?? m[3]).trim()]) throw new Error('参照画像がありません。');
  }

 return lib;
}
