// /pinyin/ 与 /en/pinyin/ 共用的三个演示(2026-11-01):
//   #dmType 打字(借 /demo/ 的词表 demo-words.js 与引擎 demo.js,契约 B,只读不改)
//   #dmAi   AI 整理这句(纯 HTML 状态机:草稿 → 正在整理 → 结果 + 六个动作 → 用上 → 再来一次)
//   #dmUndo 退格退回(同一个引擎;引擎的时钟换成「看得见才走」的虚拟钟,倒计时条与引擎的退回窗口同一只钟)
// 文案按 <html lang> 选;固定的字在 HTML,这里只放会变的。
// 纪律:⛔ 零 innerHTML(候选、拼音、上屏的字一律 textContent / createElement);⛔ 零网络;
//      计时只在演示看得见时走(IntersectionObserver + visibilitychange);减弱动效:状态照切,样子在 pinyin.css。
(function () {
'use strict';
var ZH = /^zh/i.test(document.documentElement.lang || '');
var T = ZH ? {
  missing: '演示没有加载出来,刷新页面再试。',
  next: '接写',
  typeLive: { fill: '拼音填好了。第一个候选:{c}。', commit: '上屏:{c}。', undo: '退回拼音,重选。', clear: '清空了。' },
  aiHint: { draft: '点「AI 整理这句」,或按回车。', busy: '正在整理…', result: '换一个动作看看,或点「用上」。', used: '换进框里了。点「再来一次」。' },
  aiHead: { busy: '正在整理…', result: '整理好了' },
  aiLive: { result: '整理好了:{t}', chip: '{c}:{t}', used: '用上了,框里的字换好了。', again: '回到半成品。' },
  undoHint: {
    compose: '先上屏「输入法」,再在条走完之前按退格。',
    window: '条走完之前按退格,整个词退回拼音。',
    late: '条走完了。现在按退格,只删一个字。',
    undone: '退回拼音了,可以重选。按 1 再上屏。',
    deleted: '只删了一个字。点「重来」再试一次。'
  },
  undoLive: { window: '上屏了:输入法。', late: '退回的时间过了。', undone: '整个词退回拼音:shu ru fa。', deleted: '删了一个字。' }
} : {
  missing: 'The demo did not load. Refresh the page and try again.',
  next: 'Next',
  typeLive: { fill: 'Pinyin filled in. First candidate: {c}.', commit: 'Committed: {c}.', undo: 'Back to Pinyin to choose again.', clear: 'Cleared.' },
  aiHint: { draft: 'Click “Tidy this sentence”, or press Return.', busy: 'Tidying…', result: 'Try another action, or click “Use it”.', used: 'It replaced the text in the box. Click “Again”.' },
  aiHead: { busy: 'Tidying…', result: 'Done' },
  aiLive: { result: 'Done: {t}', chip: '{c}: {t}', used: 'Used. The text in the box is replaced.', again: 'Back to the draft.' },
  undoHint: {
    compose: 'Commit the word first, then press Delete before the bar runs out.',
    window: 'Press Delete before the bar runs out and the whole word goes back to Pinyin.',
    late: 'The bar ran out. Delete now removes one character.',
    undone: 'Back to Pinyin, ready to choose again. Press 1 to commit.',
    deleted: 'Only one character went. Click “Start over” to try again.'
  },
  undoLive: { window: 'Committed.', late: 'The undo window has passed.', undone: 'The whole word went back to Pinyin: shu ru fa.', deleted: 'One character deleted.' }
};
// AI 卡的六个动作:预置文本(演示用,不是真的请求)。中英两页同一份:输入法打的是中文。
var AI = {
  tidy: '我们明天下午的会议可能要推迟,因为老师那边临时有事。',
  formal: '因老师临时有事,明天下午的会议可能需要延期,敬请谅解。',
  casual: '明天下午的会估计得往后推推,老师那边临时有事。',
  cont: '我们明天下午的会议可能要推迟,因为老师那边临时有事。新的时间定下来后,我再告诉大家。',
  en: 'Our meeting tomorrow afternoon may need to be pushed back, because something came up on the teacher’s side.',
  ask: '改期的消息最好写清新的时间。可以补一句:改到哪天几点,大家看是否方便。'
};
var UNDO_MS = 1500;   // 与引擎 demo.js 的 UNDO_WINDOW_MS 同值(F7);倒计时条按它画

function $(root, sel) { return root.querySelector(sel); }
function say(el, s) { el.textContent = ''; setTimeout(function () { el.textContent = s; }, 30); }
function fill(s, o) { return s.replace(/\{(\w)\}/g, function (_, k) { return o[k]; }); }

// 每个演示一只钟:看得见才走;after(ms, fn) 排在这只钟上(同 /mobile/ 的做法)。
function Clock(el, onTick) {
  var c = { vt: 0, last: 0, iv: 0, q: [], seen: false, busy: false };
  function now() { return c.vt + (c.iv ? performance.now() - c.last : 0); }
  function step() {
    var n = performance.now(); c.vt += n - c.last; c.last = n;
    c.q.sort(function (a, b) { return a.t - b.t; });
    while (c.q.length && c.q[0].t <= c.vt) c.q.shift().fn();
    if (onTick) onTick(c.vt);
    sync();
  }
  function sync() {
    var want = c.seen && !document.hidden && (c.busy || c.q.length > 0);
    if (want && !c.iv) { c.last = performance.now(); c.iv = setInterval(step, 50); }
    else if (!want && c.iv) { c.vt = now(); clearInterval(c.iv); c.iv = 0; }
  }
  new IntersectionObserver(function (es) { c.seen = es[0].isIntersecting; sync(); }, { threshold: 0.2 }).observe(el);
  document.addEventListener('visibilitychange', sync);
  return {
    now: now,
    after: function (ms, fn) { c.q.push({ t: now() + ms, fn: fn }); sync(); },
    clear: function () { c.q.length = 0; sync(); },
    busy: function (b) { c.busy = b; sync(); }
  };
}

/* ── 引擎的画法(#dmType 与 #dmUndo 共用):输入框 + 候选条 ── */
function Ime(root, now) {
  var box = $(root, '[data-box]'), out = $(root, '[data-out]'), comp = $(root, '[data-comp]'), ph = $(root, '[data-ph]');
  var bar = $(root, '[data-bar]'), py = $(root, '[data-py]'), cands = $(root, '[data-cands]'), pg = $(root, '[data-pg]');
  var engine = window.MurmurDemoEngine(window.MURMUR_DEMO_WORDS, { now: now });
  var after = null;
  function paint(st) {
    out.textContent = st.committed;
    comp.textContent = st.buffer;
    if (ph) ph.hidden = !!(st.committed || st.buffer);
    var list = st.buffer ? st.candidates.map(function (c) { return c.text; }) : st.predictions;
    bar.hidden = list.length === 0 && !st.buffer;
    bar.classList.toggle('pn-next', !st.buffer);
    py.textContent = st.buffer ? st.segments.join(' ') : T.next;
    cands.textContent = '';
    list.forEach(function (text, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'pn-cand' + (i === 0 && st.buffer ? ' on' : ''); b.tabIndex = -1;
      b.dataset.i = String(i + 1);
      var n = document.createElement('i'); n.textContent = String(i + 1);
      b.appendChild(n); b.appendChild(document.createTextNode(text));
      cands.appendChild(b);
    });
    pg.textContent = st.buffer && st.pages > 1 ? '‹ ' + (st.page + 1) + ' ›' : '';
    root.dataset.composing = st.buffer ? 'true' : 'false';
  }
  engine.onChange(function (st) { paint(st); if (after) after(st); });
  cands.addEventListener('click', function (e) {
    var b = e.target.closest('.pn-cand');
    if (!b) return;
    engine.press(b.dataset.i);
    box.focus({ preventScroll: true });
  });
  var KEYS = { ' ': 'Space', Backspace: 'Backspace', Enter: 'Enter', Escape: 'Escape' };
  box.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    var k = e.key;
    var key = KEYS[k] || (/^[a-zA-Z0-9,.\-=]$/.test(k) ? k : null);
    if (!key) return;
    e.preventDefault();
    engine.press(key);
  });
  paint(engine.state());
  return {
    engine: engine, box: box,
    type: function (letters) { for (var i = 0; i < letters.length; i++) engine.press(letters[i]); },
    onAfter: function (fn) { after = fn; }
  };
}

function enginesMissing(root) {
  if (typeof window.MurmurDemoEngine === 'function' && window.MURMUR_DEMO_WORDS) return false;
  var h = $(root, '[data-hint]'); if (h) { h.textContent = T.missing; h.classList.add('err'); }
  Array.prototype.forEach.call(root.querySelectorAll('button'), function (b) { b.disabled = true; });
  return true;
}

/* ── 演示 A:打字 ── */
(function () {
  var root = document.getElementById('dmType');
  if (!root || enginesMissing(root)) return;
  var live = $(root, '[data-live]');
  var ime = Ime(root, function () { return Date.now(); });
  var last = '';
  ime.onAfter(function (st) {
    if (st.lastAction === 'commit' && st.committed !== last) say(live, fill(T.typeLive.commit, { c: st.committed.slice(last.length) || st.committed }));
    if (st.lastAction === 'undo') say(live, T.typeLive.undo);
    last = st.committed;
  });
  Array.prototype.forEach.call(root.querySelectorAll('[data-preset]'), function (b) {
    b.addEventListener('click', function () {
      ime.engine.reset(); last = '';
      ime.type(b.dataset.preset);
      var st = ime.engine.state();
      say(live, fill(T.typeLive.fill, { c: st.candidates.length ? st.candidates[0].text : '' }));
      ime.box.focus({ preventScroll: true });
    });
  });
  $(root, '[data-clear]').addEventListener('click', function () {
    ime.engine.reset(); last = ''; say(live, T.typeLive.clear);
    ime.box.focus({ preventScroll: true });
  });
})();

/* ── 演示 B:AI 整理这句 ── */
(function () {
  var root = document.getElementById('dmAi');
  if (!root) return;
  var text = $(root, '[data-text]'), card = $(root, '[data-card]'), head = $(root, '[data-cardh]'), out = $(root, '[data-out]');
  var hint = $(root, '[data-hint]'), live = $(root, '[data-live]');
  var bRun = $(root, '[data-run]'), bUse = $(root, '[data-use]'), bAgain = $(root, '[data-again]');
  var chips = root.querySelectorAll('[data-chip]');
  var draft = text.textContent, state = 'draft', pick = 'tidy';
  var clk = Clock(root);
  function inside() { return root.contains(document.activeElement); }
  function set(s, liveText) {
    state = s; root.dataset.state = s;
    hint.textContent = T.aiHint[s];
    card.hidden = !(s === 'busy' || s === 'result');
    bRun.hidden = s !== 'draft';
    bUse.hidden = s !== 'result';
    bAgain.hidden = s !== 'used';
    for (var i = 0; i < chips.length; i++) chips[i].disabled = s !== 'result';
    if (liveText) say(live, liveText);
  }
  function choose(k) {
    pick = k;
    for (var i = 0; i < chips.length; i++) chips[i].setAttribute('aria-pressed', String(chips[i].dataset.chip === k));
    out.textContent = AI[k];
  }
  function run() {
    if (state !== 'draft') return;
    var f = inside();
    choose('tidy'); out.textContent = '';
    head.textContent = T.aiHead.busy;
    set('busy');
    if (f) root.focus({ preventScroll: true });
    clk.after(1200, function () {
      choose('tidy');
      head.textContent = T.aiHead.result;
      set('result', fill(T.aiLive.result, { t: AI.tidy }));
      if (inside() || document.activeElement === document.body) bUse.focus({ preventScroll: true });
    });
  }
  function use() {
    if (state !== 'result') return;
    var f = inside();
    text.textContent = AI[pick];
    set('used', T.aiLive.used);
    if (f) bAgain.focus({ preventScroll: true });
  }
  function again() {
    var f = inside();
    clk.clear(); text.textContent = draft;
    set('draft', T.aiLive.again);
    if (f) bRun.focus({ preventScroll: true });
  }
  root.tabIndex = -1;
  bRun.addEventListener('click', run);
  bUse.addEventListener('click', use);
  bAgain.addEventListener('click', again);
  Array.prototype.forEach.call(chips, function (c) {
    c.addEventListener('click', function () {
      if (state !== 'result') return;
      choose(c.dataset.chip);
      say(live, fill(T.aiLive.chip, { c: c.textContent, t: AI[pick] }));
    });
  });
  // 和 App 同一个键:⌥⇧Space 按一次出,再按一次用上(焦点在演示里时)
  root.addEventListener('keydown', function (e) {
    if (!(e.altKey && e.shiftKey && e.code === 'Space')) return;
    e.preventDefault();
    if (state === 'draft') run(); else if (state === 'result') use();
  });
  set('draft');
})();

/* ── 演示 C:退格退回 ── */
(function () {
  var root = document.getElementById('dmUndo');
  if (!root || enginesMissing(root)) return;
  var hint = $(root, '[data-hint]'), live = $(root, '[data-live]'), tbar = $(root, '[data-tbar]');
  var state = 'compose', until = 0;
  var clk = Clock(root, tick);
  var ime = Ime(root, clk.now);   // 引擎的退回窗口按这只钟算:看不见时窗口也停
  function set(s, liveText) {
    state = s; root.dataset.state = s;
    hint.textContent = T.undoHint[s];
    if (liveText) say(live, liveText);
  }
  function paintBar(k) { tbar.style.transform = 'scaleX(' + Math.max(0, Math.min(1, k)).toFixed(3) + ')'; }
  function tick() {
    if (state !== 'window') return;
    var left = until - clk.now();
    paintBar(left / UNDO_MS);
    if (left <= 0) { clk.busy(false); set('late', T.undoLive.late); }
  }
  ime.onAfter(function (st) {
    if (st.lastAction === 'commit' && st.undoUntil) {
      until = st.undoUntil; paintBar(1); set('window', T.undoLive.window); clk.busy(true);
    } else if (st.lastAction === 'undo') {
      clk.busy(false); paintBar(0); set('undone', T.undoLive.undone);
    } else if (state === 'window' || state === 'late') {
      clk.busy(false); paintBar(0);
      if (st.buffer) set('compose');                                   // 窗口里接着打了别的:窗口关掉
      else if (st.lastAction === 'type') set('deleted', T.undoLive.deleted);
      else set('late');
    }
  });
  function fresh() {
    clk.busy(false); paintBar(0);
    ime.engine.reset(); ime.type('shurufa');
    set('compose');
  }
  $(root, '[data-commit]').addEventListener('click', function () {
    if (!ime.engine.state().buffer) fresh();
    ime.engine.press('1');
  });
  $(root, '[data-bs]').addEventListener('click', function () { ime.engine.press('Backspace'); });
  $(root, '[data-reset]').addEventListener('click', fresh);
  fresh();
})();
})();
