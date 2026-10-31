// /mobile/ 与 /en/mobile/ 共用的两台设备(#dmWatch 手表、#dmPhone iPhone)。文案按 <html lang> 选;固定的字在 HTML,这里只放会变的。
// 计时只在设备看得见时走(IntersectionObserver + visibilitychange)。减弱动效:状态照切,样子在 mobile.css。
(function () {
'use strict';
var T = {
  zh: {
    w: { idle: '点一下橙色的键。', recording: '在录。按住屏幕一秒,停。', holding: '按住,别松手。',
         saved: '已保存,正在传给手机。', sent: '传到手机了。再点一下橙键,再录一次。' },
    wLive: { back: '松早了,还在录。', saved: '已保存,时长 {d}。', sent: '已传到手机,历史里多了一条。' },
    h: { now: '刚刚', from: '从手表传来', ing: '转写中', done: '已转写',
         x: ['说话人 1:大家早上好。', '今天讲供给和需求怎么决定价格。'] },
    p: { home: '点「开始录音」。', recording: '在录。点「结束并转写」。', transcribing: '转写中。',
         done: '录完了,分出谁在说。' },
    pLive: { discard: '丢弃了,回到开始。', done: '录完了,时长 {d},分出谁在说。' },
    cap: ['大家早上好。', '今天讲供给和需求怎么决定价格。', '需求上升、供给不变的时候,价格会一直涨。',
          '直到两边重新相等。', '有同学问,那供给也涨呢?'],
    h12: false
  },
  en: {
    w: { idle: 'Tap the orange button.', recording: 'Recording. Press and hold the screen for a second to stop.',
         holding: 'Keep holding.', saved: 'Saved. Sending to your phone.',
         sent: 'Sent to your phone. Tap the orange button to record again.' },
    wLive: { back: 'Let go too early. Still recording.', saved: 'Saved, {d} long.', sent: 'Sent to your phone. A new recording is in History.' },
    h: { now: 'Just now', from: 'From your watch', ing: 'Transcribing', done: 'Transcribed',
         x: ['Speaker 1: Good morning.', 'Today we look at how supply and demand set the price.'] },
    p: { home: 'Tap “Start recording”.', recording: 'Recording. Tap “Stop and transcribe”.',
         transcribing: 'Transcribing.', done: 'Done, split by speaker.' },
    pLive: { discard: 'Discarded. Back to the start.', done: 'Done, {d} long, split by speaker.' },
    cap: ['Good morning.', 'Today we look at how supply and demand set the price.',
          'When demand rises and supply stays put, the price keeps climbing.', 'Until the two meet again.',
          'Someone asked, what if supply rises too?'],
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

/* ── 演示 A:手表 ── */
(function () {
  var root = document.getElementById('dmWatch');
  if (!root) return;
  var scr = $(root, '.ws-scr'), orb = $(root, '.w-orb'), hint = $(root, '[data-hint]'), live = $(root, '[data-live]');
  var clock = $(root, '[data-w=clock]'), dur = $(root, '[data-w=dur]'), lastN = $(root, '[data-w=last]');
  var list = $(root, '[data-hist]'), quads = root.querySelectorAll('.w-quad i');
  var state = 'idle', t0 = 0, recMs = 0, holdTimer = 0, holdIv = 0, holdAt = 0, keyHeld = false;
  var clk = Clock(root, function () { if (state === 'recording' || state === 'holding') paintClock(); });
  fit(root, $(root, '.dm-wcol'), 396 * 1.18, 0.56);

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

/* ── 演示 B:iPhone ── */
(function () {
  var root = document.getElementById('dmPhone');
  if (!root) return;
  var hint = $(root, '[data-hint]'), live = $(root, '[data-live]'), again = $(root, '.dm-again');
  var timer = $(root, '[data-p=timer]'), meta = $(root, '[data-p=meta]'), lines = $(root, '[data-p=lines]');
  var bars = root.querySelectorAll('.p-bars i');
  var bStart = $(root, '[data-act=start]'), bStop = $(root, '[data-act=stop]'), bDiscard = $(root, '[data-act=discard]');
  var state = 'home', t0 = 0, n = 0, ticks = 0;
  var clk = Clock(root, function (vt) {
    if (state !== 'recording') return;
    timer.textContent = mss(vt - t0);
    if (!reduced && (++ticks % 2 === 0)) jitter();
  });
  fit(root, $(root, '.dm-pcol'), 423, 0.74);

  function jitter() {
    for (var i = 0; i < bars.length; i++) bars[i].style.height = (6 + Math.round(Math.random() * 18)) + 'px';
  }
  function set(s, liveText) {
    state = s; root.dataset.state = s;
    hint.textContent = T.p[s];
    again.hidden = s !== 'done';
    if (liveText) say(live, liveText);
    clk.busy(s === 'recording');
  }
  function inside() { return root.contains(document.activeElement); }
  function nextLine() {
    if (state !== 'recording') return;
    var p = document.createElement('p'); p.textContent = T.cap[n % T.cap.length]; n++;
    lines.appendChild(p);
    while (lines.children.length > 3) lines.removeChild(lines.firstChild);
    clk.after(1600 + Math.random() * 800, nextLine);
  }
  function home(liveText) {
    var f = inside();
    clk.clear(); timer.textContent = '0:00'; lines.textContent = '';
    set('home', liveText);
    if (f) bStart.focus({ preventScroll: true });
  }
  bStart.addEventListener('click', function () {
    var f = inside();
    clk.clear(); t0 = clk.now(); n = 0; ticks = 0; lines.textContent = ''; timer.textContent = '0:00';
    set('recording', T.p.recording);
    if (f) bStop.focus({ preventScroll: true });
    clk.after(1000, nextLine);
  });
  bDiscard.addEventListener('click', function () { home(T.pLive.discard); });
  bStop.addEventListener('click', function () {
    var f = inside(), d = mss(clk.now() - t0);
    clk.clear(); timer.textContent = d; meta.textContent = d;
    set('transcribing', T.p.transcribing);
    if (f) root.focus({ preventScroll: true });
    clk.after(1500, function () {
      root.classList.add('had');
      set('done', T.pLive.done.replace('{d}', d));
      if (inside()) again.focus({ preventScroll: true });
    });
  });
  again.addEventListener('click', function () { home(T.p.home); });
})();
})();
