// Run: gjs tests/parser.js (from repository root)
const GLib = imports.gi.GLib;
const source = imports.byteArray.toString(GLib.file_get_contents('public/app.js')[1]);
const parseLesson = new Function(source.slice(source.indexOf('function parseLesson('),source.indexOf('const maxFileBytes')) + '; return parseLesson;')();
function assert(condition, message) { if (!condition) throw new Error(message); }
const notes = parseLesson('# 細胞\n\n## 学習\n\n**細胞**です。\n\n## テスト\n\n### 基本単位は？\n\n細胞');
assert(notes.length === 2 && notes[0].kind === 'learn' && notes[1].questions[0].answer === '細胞','combined lesson');
const detailed = parseLesson('# 図の問題\n\n## テスト\n\n### 構造は？\n\n#### 問題\n\n図を見る\n\n#### 答え\n\n核\n\n#### 解説\n\nDNAを含む');
assert(detailed[0].questions[0].prompt === '図を見る' && detailed[0].questions[0].explanation === 'DNAを含む','question blocks');
for (const bad of ['本文だけ','# 空\n\n## 学習','# 空\n\n## テスト\n\n### 答えなし','# 重複\n\n## 学習\n\na\n\n## 学習\n\nb']) {
 let rejected = false; try { parseLesson(bad); } catch { rejected = true; } assert(rejected,'invalid lesson accepted');
}
print('PASS: combined lesson, question blocks, four invalid inputs');
