// /mobile/ 与 /en/mobile/ 共用:首屏 iPhone 的计时(在走的那个 23:41)+ 「怎么用」下面那块能按的手表(#dmWatch)。
// 2026-11-20 v2:iPhone 长录音演示删了(首屏那台手机已经停在录到一半),只留手表。
// 文案按 <html lang> 选;固定的字在 HTML,这里只放会变的。
// 计时只在设备看得见时走(IntersectionObserver + visibilitychange)。减弱动效:首屏计时不走;演示状态照切,样子在 mobile.css。
(function () {
'use strict';
var T = {
  zh: {
    w: { idle: '点中间的橙色圆,开始录。', recording: '在录了。按住屏幕一秒就停。', holding: '别松手。',
         saved: '存好了,在往手机上传。', sent: '传过去了。想再录,再点一下橙色圆。' },
    wLive: { back: '松早了,还在录。', saved: '已保存,时长 {d}。', sent: '传到手机了,历史里多了一条。' },
    h: { now: '刚刚', from: '从手表传来', ing: '转写中', done: '已转写',
         x: ['说话人 1:今天想跟大家聊聊老房子怎么改。', '说话人 2:能先说说大概要花多少钱吗?'] },
    h12: false
  },
  en: {
    w: { idle: 'Tap the circle in the middle to start.', recording: 'Recording. Hold the screen for a second to stop.',
         holding: 'Keep holding.', saved: 'Saved. Sending it over now.',
         sent: 'Your phone has it. Tap again for another one.' },
    wLive: { back: 'You let go early. Still recording.', saved: 'Saved, {d} long.', sent: 'Sent. One more item in History.' },
    h: { now: 'Just now', from: 'From your watch', ing: 'Transcribing', done: 'Transcribed',
         x: ['Speaker 1: Today I want to talk about fixing up old houses.', 'Speaker 2: Could you start with roughly what it costs?'] },
    h12: true
  }
}[/^zh/.test(document.documentElement.lang) ? 'zh' : 'en'];

var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function mss(ms) { var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
function $(root, sel) { return root.querySelector(sel); }
function say(el, s) { el.textContent = ''; setTimeout(function () { el.textContent = s; }, 30); }

// 每台设备一只钟:看得见才走;after(ms, fn) 排在这只钟上。
function Clock(el, onTick) {
  var c = { vt: 0, last: 0, iv: 0, q: [], seen: false, busy: false };
  function now() { return c.vt + (c.iv ? performance.now() - c.last : 0); }
  function step() {
    var n = performance.now(); c.vt += n - c.last; c.last = n;
    c.q.sort(function (a, b) { return a.t - b.t; });
    while (c.q.length && c.q[0].t <= c.vt) c.q.shift().fn();
    onTick(c.vt); sync();
  }
  function sync() {
    var want = c.seen && !document.hidden && (c.busy || c.q.length > 0);
    if (want && !c.iv) { c.last = performance.now(); c.iv = setInterval(step, 100); }
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

// 设备按设计宽排版,--k = 容器宽 / 设计宽(封顶 max),CSS 用它 scale。
function fit(dev, box, design, max) {
  function go() {
    var w = box.clientWidth;
    if (!w) return;
    var k = Math.min(max, (w - 2) / design);
    dev.style.setProperty('--k', k.toFixed(4));
  }
  new ResizeObserver(go).observe(box); go();
}

// 进视口才让 CSS 动画跑:.m-anim 加 / 去 .run(mobile.css 里没 .run 的一律暂停)
(function () {
  var els = document.querySelectorAll('.m-anim');
  if (!('IntersectionObserver' in window)) { for (var i = 0; i < els.length; i++) els[i].classList.add('run'); return; }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { e.target.classList.toggle('run', e.isIntersecting); });
  }, { threshold: 0.1 });
  for (var j = 0; j < els.length; j++) io.observe(els[j]);
})();

/* ── 首屏:iPhone 上那只在走的钟(23:41 起)。看得见才走;减弱动效时不走 ── */
(function () {
  var el = document.querySelector('[data-hero-timer]');
  if (!el || reduced) return;
  var stage = el.closest('.m-stage') || el, bars = document.querySelectorAll('[data-hero-bars] i');
  var sec = parseInt(el.getAttribute('data-start'), 10) || 0, iv = 0, seen = false;
  function tick() {
    sec++;
    el.textContent = mss(sec * 1000);
    for (var i = 0; i < bars.length; i++) bars[i].style.height = (6 + Math.round(Math.random() * 16)) + 'px';
  }
  function sync() {
    var want = seen && !document.hidden;
    if (want && !iv) iv = setInterval(tick, 1000);
    else if (!want && iv) { clearInterval(iv); iv = 0; }
  }
  new IntersectionObserver(function (es) { seen = es[0].isIntersecting; sync(); }, { threshold: 0.2 }).observe(stage);
  document.addEventListener('visibilitychange', sync);
})();

/* ── 演示:手表 ── */
(function () {
  var root = document.getElementById('dmWatch');
  if (!root) return;
  var scr = $(root, '.ws-scr'), orb = $(root, '.w-orb'), hint = $(root, '[data-hint]'), live = $(root, '[data-live]');
  var clock = $(root, '[data-w=clock]'), dur = $(root, '[data-w=dur]'), lastN = $(root, '[data-w=last]');
  var list = $(root, '[data-hist]'), quads = root.querySelectorAll('.w-quad i');
  var state = 'idle', t0 = 0, recMs = 0, holdTimer = 0, holdIv = 0, holdAt = 0, keyHeld = false;
  var clk = Clock(root, function () { if (state === 'recording' || state === 'holding') paintClock(); });
  fit(root, $(root, '.dm-wcol'), 396 * 1.18, 0.34);

  function paintClock() {
    var d = new Date(), h = d.getHours();
    if (T.h12) h = h % 12 || 12;
    clock.textContent = (T.h12 ? h : ('0' + h).slice(-2)) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function set(s, liveText) {
    state = s; root.dataset.state = s;
    hint.textContent = T.w[s];
    if (liveText) say(live, liveText);
    var rec = s === 'recording' || s === 'holding';
    scr.tabIndex = rec ? 0 : -1;
    clk.busy(rec);
  }
  function start() {
    var hadFocus = document.activeElement === orb;
    clk.clear(); t0 = clk.now(); paintClock();
    set('recording', T.w.recording);
    if (hadFocus) scr.focus();
  }
  function holdDown() {
    if (state !== 'recording') return;
    holdAt = performance.now();
    set('holding', T.w.holding);
    paintQuads(0);
    holdIv = setInterval(function () { paintQuads(performance.now() - holdAt); }, 50);
    holdTimer = setTimeout(stop, 1000);
  }
  function holdUp() {
    if (state !== 'holding') return;
    clearTimeout(holdTimer); clearInterval(holdIv);
    set('recording', T.wLive.back);
  }
  function paintQuads(ms) {
    var n = Math.min(4, Math.floor(ms / 250));
    for (var i = 0; i < quads.length; i++) quads[i].classList.toggle('on', i < n);
  }
  function stop() {
    clearInterval(holdIv); paintQuads(1000);
    recMs = clk.now() - t0;
    var d = mss(recMs);
    dur.textContent = d;
    set('saved', T.wLive.saved.replace('{d}', d));   // 焦点留在表屏上,回首屏时再交给橙键
    clk.after(1200, function () {
      set('sent', T.wLive.sent);
      var item = addItem(d);
      clk.after(1500, function () { done(item); });
      clk.after(1600, function () {
        lastN.textContent = d;
        var f = document.activeElement === scr;
        root.dataset.state = state = 'idle';   // 回首屏,提示留着「再点一下」
        scr.tabIndex = -1;
        if (f) orb.focus({ preventScroll: true });
      });
    });
  }
  function addItem(d) {
    var li = document.createElement('li'); li.className = 'dm-hi dm-new';
    var row = document.createElement('div'); row.className = 'dm-hrow';
    var b = document.createElement('b'); b.textContent = T.h.now + ' · ' + d;
    var s = document.createElement('span'); s.textContent = T.h.from + ' · ';
    var em = document.createElement('em'); em.textContent = T.h.ing; s.appendChild(em);
    row.appendChild(b); row.appendChild(s); li.appendChild(row);
    list.insertBefore(li, list.firstChild);
    while (list.children.length > 3) list.removeChild(list.lastChild);
    return li;
  }
  function done(li) {
    if (!li.parentNode) return;
    var row = li.firstChild, btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'dm-hrow'; btn.setAttribute('aria-expanded', 'false');
    while (row.firstChild) btn.appendChild(row.firstChild);
    $(btn, 'em').textContent = T.h.done; $(btn, 'em').className = 'ok';
    var x = document.createElement('div'); x.className = 'dm-hx'; x.hidden = true;
    T.h.x.forEach(function (t) { var p = document.createElement('p'); p.textContent = t; x.appendChild(p); });
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open)); x.hidden = !open;
    });
    li.replaceChild(btn, row); li.appendChild(x);
  }

  orb.addEventListener('click', function () { if (state === 'idle' || state === 'sent') start(); });
  scr.addEventListener('pointerdown', function (e) {
    if (state !== 'recording' || e.button > 0) return;
    e.preventDefault();
    try { scr.setPointerCapture(e.pointerId); } catch (_) {}
    holdDown();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) { scr.addEventListener(n, holdUp); });
  scr.addEventListener('contextmenu', function (e) { if (state === 'recording' || state === 'holding') e.preventDefault(); });
  scr.addEventListener('keydown', function (e) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (e.target !== scr) return; // 橙键等子元素的按键照常(Enter 点橙键)
    e.preventDefault(); // 表屏本身在任何状态都拦:按满一秒进「已保存」后手还按着,自动重复的 Space 会把整页滚走
    if ((state === 'recording' || state === 'holding') && !e.repeat && !keyHeld) { keyHeld = true; holdDown(); }
  });
  scr.addEventListener('keyup', function (e) {
    if (e.key === ' ' || e.key === 'Enter') { keyHeld = false; holdUp(); }
  });
  scr.addEventListener('blur', function () { keyHeld = false; holdUp(); });
})();

})();
