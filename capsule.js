/* ─────────────────────────────────────────────────────────────────────────
   Murmur 录音条 · 网页复刻(capsule.js)—— 首屏、对着 AI 说话、拼音一节共用
   依据:audits/2026-10-13/site-capsule/SPEC.md(Mac 源码 HUD.swift / WaveMath.swift /
   DesignSystem.swift 抄下来的规格)。⛔ 改数值先改 SPEC,再改这里。

   用法
     var cap = MurmurCapsule.mount(el, { size: 'full' | 'mini', caption: 'above' | 'below' | 'none',
                                         mode: 'dictation' | 'translate' | 'ask' | 'edit', lang: 'zh' | 'en' });
     cap.setState('starting');                         // ✕ · 正在打开麦克风
     cap.setState('listening', { level: 0.6 });        // ✕ · 液态波形 · 计时 · ✓
     cap.setLevel(0.42); cap.setClock(2.3); cap.setCaption('定稿的', '没定稿的');
     cap.setState('processing', { seconds: 0 });       // ✕ · 整理中… · 0s · ESC 取消
     cap.setState('done', { text: '最终插入的文字' });  // 绿点 · 已插入(字幕卡换成最终文字)
     cap.setState('cancel');  cap.setState('error', { text: '错误原文' });
     cap.setState('hidden');                           // 淡出 + 下沉 6pt
   停留时长(宿主自己排):MurmurCapsule.DWELL = { starting, done, cancel, error }。

   纪律
   - 无外部库;不写内联 <style>、不用 style 属性字符串(只走 CSSOM),合站点 CSP。
   - 所有动效按时间算:减弱动效直接落终态(波形画一帧静止的);页面不可见 / 滚出视口停画。
   - 画布每帧按真实尺寸 × dpr 设大小、擦整块(SPEC §5.1-A 的残点就是没擦干净)。
   ───────────────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';
  var doc = global.document;

  /* ── 时钟:默认 performance.now;截图 / 测试切成手动 ── */
  var Clock = { manual: false, t: 0 };
  function now() { return Clock.manual ? Clock.t : global.performance.now(); }

  var mqReduce = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var mqDark = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;
  var forceReduced = null;
  function isReduced() { return forceReduced !== null ? forceReduced : !!(mqReduce && mqReduce.matches); }

  /* ── DS.Motion(DesignSystem.swift 121–171 行) ── */
  var MOTION = {
    hudShow: 120,                 // 面板出现:alpha 0→1,easeOut,不位移
    hudHide: 180,                 // 面板收起:alpha →0 + 下沉 6pt,easeIn
    hudHideDrop: 6,
    stretch: { response: 0.42, damping: 0.88 },   // 胶囊 / 字幕卡变宽变高:不回弹
    state: { response: 0.22, damping: 0.85 },     // snappy(0.22):字幕卡透明度、计时数字
    contentIn: { dur: 200, delay: 80, scale: 0.86 },
    contentOut: { dur: 120, scale: 0.94 }
  };
  /* 停留(DictationEngine.swift):完成 1.8s,取消 0.9s,出错 2.5s;开麦段约 300ms(SPEC §6.5) */
  var DWELL = { starting: 300, done: 1800, cancel: 900, error: 2500 };

  var STR = {
    zh: {
      starting: '正在打开麦克风', done: '已插入', cancel: '已取消', error: '出错了', esc: 'ESC 取消',
      proc: { dictation: '整理中…', translate: '翻译中', ask: '想…', edit: '改写中' },
      mode: { translate: '翻译', ask: '随心问', edit: '口述编辑' }
    },
    en: {
      starting: 'Opening the mic', done: 'Inserted', cancel: 'Cancelled', error: 'Failed', esc: 'Esc to cancel',
      proc: { dictation: 'Cleaning up…', translate: 'Translating', ask: 'Thinking…', edit: 'Editing' },
      mode: { translate: 'Translate', ask: 'Ask', edit: 'Voice edit' }
    }
  };

  /* ── 曲线:SwiftUI easeOut / easeIn = CA 的 (0,0,.58,1) / (.42,0,1,1) ── */
  function bezier(x1, y1, x2, y2) {
    function at(t, a, b) { var u = 1 - t; return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t; }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var lo = 0, hi = 1, t = x;
      for (var i = 0; i < 24; i++) {
        t = (lo + hi) / 2;
        if (at(t, x1, x2) < x) lo = t; else hi = t;
      }
      return at(t, y1, y2);
    };
  }
  var easeOut = bezier(0, 0, 0.58, 1);
  var easeIn = bezier(0.42, 0, 1, 1);

  /* ── 补间(内容进退场、面板进出) ── */
  function Tween(v) { this.from = v; this.to = v; this.t0 = 0; this.dur = 0; this.delay = 0; this.ease = easeOut; }
  Tween.prototype.value = function (t) {
    if (this.dur <= 0) return this.to;
    var dt = t - this.t0 - this.delay;
    if (dt <= 0) return this.from;
    if (dt >= this.dur) return this.to;
    return this.from + (this.to - this.from) * this.ease(dt / this.dur);
  };
  Tween.prototype.go = function (to, t, dur, delay, ease) {
    var cur = this.value(t);
    this.from = cur; this.to = to; this.t0 = t; this.dur = dur; this.delay = delay || 0; this.ease = ease;
  };
  Tween.prototype.snap = function (v) { this.from = v; this.to = v; this.dur = 0; };
  Tween.prototype.busy = function (t) { return this.dur > 0 && t < this.t0 + this.delay + this.dur; };

  /* ── 弹簧(解析解,可中途改目标并保留速度 = SwiftUI 的弹簧手感) ── */
  function Spring(cfg, value, eps) {
    this.w = 2 * Math.PI / cfg.response;
    this.z = cfg.damping;
    this.wd = this.w * Math.sqrt(1 - this.z * this.z);
    this.x0 = value; this.v0 = 0; this.target = value; this.t0 = 0;
    this.done = true; this.eps = eps || 0.25;
  }
  Spring.prototype.at = function (t) {
    if (this.done) return [this.target, 0];
    var dt = Math.max(0, (t - this.t0) / 1000);
    var a = this.z * this.w, wd = this.wd;
    var A = this.x0 - this.target, B = (this.v0 + a * A) / wd;
    var e = Math.exp(-a * dt), c = Math.cos(wd * dt), s = Math.sin(wd * dt);
    return [this.target + e * (A * c + B * s), e * ((B * wd - a * A) * c - (A * wd + a * B) * s)];
  };
  Spring.prototype.value = function (t) {
    if (this.done) return this.target;
    var r = this.at(t);
    if (Math.abs(r[0] - this.target) < this.eps && Math.abs(r[1]) < this.eps * 10) { this.done = true; return this.target; }
    return r[0];
  };
  Spring.prototype.set = function (target, t, snap) {
    if (snap) { this.target = target; this.x0 = target; this.v0 = 0; this.done = true; return; }
    if (target === this.target) return;
    var r = this.at(t);
    this.x0 = r[0]; this.v0 = r[1]; this.t0 = t; this.target = target; this.done = false;
  };
  Spring.prototype.from = function (start, target, t) {
    this.x0 = start; this.v0 = 0; this.t0 = t; this.target = target; this.done = false;
  };

  /* ── 液态波形(WaveMath.swift `LiquidWave`,逐字照抄) ── */
  function offset(k, phase, amp, H, side) {
    var taper = 0.4 + 0.6 * Math.sin(Math.PI * k);
    var ripple = 0.52 + 0.30 * Math.sin(k * 7 + phase + side) + 0.18 * Math.sin(k * 13.5 - phase * 0.7 + side * 1.4);
    return (H * 0.5) * (0.3 + 0.7 * amp) * taper * ripple;
  }
  function liquidPath(W, H, amp, phase) {
    var p = new Path2D(), mid = H / 2, step = 3, x = 0, wk = Math.max(1, W);
    while (x <= W) {                         // 上边缘:左 → 右,side 0
      var y = mid - offset(x / wk, phase, amp, H, 0);
      if (x === 0) p.moveTo(x, y); else p.lineTo(x, y);
      x += step;
    }
    x = W;
    while (x >= 0) {                         // 下边缘:右 → 左,side 1.7,然后封口
      p.lineTo(x, mid + offset(x / wk, phase, amp, H, 1.7));
      x -= step;
    }
    p.closePath();
    return p;
  }

  /* ── 小工具 ── */
  function el(tag, cls, parent) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function icon(d, width) {
    var s = doc.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    var p = doc.createElementNS(SVGNS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('stroke-width', String(width));
    s.appendChild(p);
    return s;
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  /* ── 全局帧循环:一个 rAF 驱动所有实例;没东西在动就停 ── */
  var instances = [];
  var rafId = 0;
  function loop() {
    rafId = 0;
    var t = now(), more = false;
    for (var i = 0; i < instances.length; i++) {
      var c = instances[i];
      if (c._active() && c._frame(t)) more = true;
    }
    if (more) rafId = global.requestAnimationFrame(loop);
  }
  function wake() {
    if (Clock.manual || rafId) return;
    rafId = global.requestAnimationFrame(loop);
  }
  if (doc) doc.addEventListener('visibilitychange', function () { if (!doc.hidden) wake(); });
  function onThemeChange() { for (var i = 0; i < instances.length; i++) instances[i].refreshTheme(); }
  if (mqDark) {
    if (mqDark.addEventListener) mqDark.addEventListener('change', onThemeChange);
    else if (mqDark.addListener) mqDark.addListener(onThemeChange);
  }
  if (global.MutationObserver && doc) {
    new MutationObserver(onThemeChange).observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  }
  if (doc && doc.fonts && doc.fonts.ready) {
    doc.fonts.ready.then(function () { for (var i = 0; i < instances.length; i++) instances[i]._remeasure(); });
    if (doc.fonts.addEventListener) {
      doc.fonts.addEventListener('loadingdone', function () { for (var i = 0; i < instances.length; i++) instances[i]._remeasure(); });
    }
  }

  /* ── 胶囊实例 ── */
  function Capsule(root, opts) {
    opts = opts || {};
    var self = this;
    this.root = root;
    this.size = opts.size === 'mini' ? 'mini' : 'full';
    this.u = opts.scale || (this.size === 'mini' ? 36 / 42 : 1);
    this.mode = STR.zh.proc[opts.mode] ? opts.mode : 'dictation';
    var htmlLang = (doc.documentElement.getAttribute('lang') || '').toLowerCase();
    this.lang = opts.lang === 'en' || (opts.lang !== 'zh' && htmlLang.indexOf('en') === 0) ? 'en' : 'zh';
    this.str = STR[this.lang];
    this.captionPos = opts.caption || (this.size === 'mini' ? 'none' : 'above');
    this.waveW = opts.waveWidth || (this.mode === 'dictation' ? 196 : 156);   // HUD.swift:420

    this.state = 'hidden';
    this.shown = false;
    this.level = 0;
    this.amp = 0;
    this._waveT = 0;
    this.procSeconds = 0;
    this.procLabel = this.str.proc[this.mode];
    this.fin = ''; this.vol = '';
    this.result = '';
    this.keys = [];
    this.inView = true;
    this._colors = null;

    /* DOM */
    root.classList.add('mc');
    root.setAttribute('data-size', this.size);
    root.setAttribute('data-caption', this.captionPos);
    if (opts.scale) root.style.setProperty('--mc-u', this.u + 'px');
    root.style.setProperty('--mc-reserve', String(42 + (this.captionPos === 'none' ? 0 : 8 + 86)));
    if (!root.hasAttribute('role')) root.setAttribute('aria-hidden', 'true');

    this.panel = el('div', 'mc-panel', root);
    this.liveCard = el('div', 'mc-card mc-glass mc-live', this.panel);
    this.liveIn = el('div', 'mc-card-in', this.liveCard);
    this.finEl = el('span', 'mc-fin', this.liveIn);
    this.volEl = el('span', 'mc-vol', this.liveIn);
    this.doneCard = el('div', 'mc-card mc-glass mc-done', this.panel);
    this.doneIn = el('div', 'mc-card-in', this.doneCard);
    this.pill = el('div', 'mc-pill mc-glass', this.panel);
    var meas = el('div', 'mc-live mc-measure', root);
    this.measure = el('span', 'mc-card-in', meas);

    var u = this.u;
    /* plain = HUD.swift 里没挂 .hudContent 的件(timerText、Chip):默认 .opacity 过场,
       跟着状态那条 stretch 弹簧走 —— 只做透明度、不缩放、没有 80ms 延迟 */
    function item(key, cls, anchor, fixedW, plain) {
      var e = el('div', 'mc-it ' + cls, self.pill);
      return { key: key, el: e, anchor: anchor, fixedW: fixedW, live: false, want: false, plain: !!plain,
               op: new Tween(0), sc: new Tween(1), opSp: plain ? new Spring(MOTION.stretch, 0, 0.002) : null,
               lastOp: -1, lastSc: -1 };
    }
    this.items = {
      x: item('x', 'mc-btn mc-x', 'left', 24),
      dot: item('dot', 'mc-dot', 'left', 8),
      chip: item('chip', 'mc-chip', 'center', 0, true),
      wave: item('wave', 'mc-wave', 'center', this.waveW),
      sStart: item('sStart', 'mc-status', 'center', 0),
      sProc: item('sProc', 'mc-status', 'center', 0),
      sEnd: item('sEnd', 'mc-status', 'center', 0),
      clock: item('clock', 'mc-clock', 'center', 0, true),
      check: item('check', 'mc-btn mc-check', 'right', 24)
    };
    // SF Symbol xmark / checkmark 10.5pt semibold 的近似:描边、圆头
    this.items.x.el.appendChild(icon('M8.7 8.7 L15.3 15.3 M15.3 8.7 L8.7 15.3', 1.6));
    this.items.check.el.appendChild(icon('M7.6 12.4 L10.7 15.4 L16.4 8.8', 1.8));
    this.items.wave.el.style.width = (this.waveW * u) + 'px';
    this.canvas = el('canvas', '', this.items.wave.el);
    this.items.sStart.el.textContent = this.str.starting;
    this.items.chip.el.textContent = this.str.mode[this.mode] || '';
    this.items.sEnd.el.textContent = this.str.done;
    this._renderProc();

    /* 计时数字:每位一格,变了就滚(numericText) */
    this.clockStr = '';
    this.cells = [];
    this._setClockText('0:00', false);

    /* 弹簧 / 补间 */
    this.pillW = new Spring(MOTION.stretch, 0, 0.25);
    this.panelOp = new Tween(0);
    this.panelY = new Tween(MOTION.hudHideDrop * u);
    this.liveW = new Spring(MOTION.stretch, 0, 0.25);
    this.liveH = new Spring(MOTION.stretch, 0, 0.25);
    this.liveOp = new Spring(MOTION.state, 0, 0.002);
    this.doneOp = new Spring(MOTION.state, 0, 0.002);
    this.pill.style.opacity = '0';

    if (global.IntersectionObserver) {
      this._io = new IntersectionObserver(function (es) {
        self.inView = es[es.length - 1].isIntersecting;
        if (self.inView) wake();
      }, { rootMargin: '64px' });
      this._io.observe(root);
    }
    instances.push(this);
    wake();
  }

  Capsule.prototype._active = function () {
    return Clock.manual || (this.inView && !doc.hidden);
  };

  /* ── 状态 ── */
  Capsule.prototype.setState = function (state, o) {
    o = o || {};
    var t = now();
    if (o.level != null) this.level = clamp01(+o.level);
    if (state === this.state && this.shown && state !== 'done' && state !== 'error') {
      // 同一状态重复调用:只更新数值,不重排(宿主可以每帧调)
      if (o.seconds != null) this.setProcessingSeconds(o.seconds);
      wake();
      return this;
    }
    if (o.seconds != null) this.procSeconds = o.seconds;
    if (o.label != null) this.procLabel = o.label;
    if (state === 'hidden') {
      this._doneWait = false;
      if (this.shown) {
        this.shown = false;
        if (isReduced()) { this.panelOp.snap(0); this.panelY.snap(MOTION.hudHideDrop * this.u); }
        else {
          this.panelOp.go(0, t, MOTION.hudHide, 0, easeIn);
          this.panelY.go(MOTION.hudHideDrop * this.u, t, MOTION.hudHide, 0, easeIn);
        }
      }
      this.state = 'hidden';
      wake();
      return this;
    }
    var visibleNow = this.panelOp.value(t) > 0.001;
    var animate = !isReduced() && visibleNow;

    if (state === 'processing') this._renderProc();
    if (state === 'done' || state === 'cancel' || state === 'error') {
      var tone = o.tone || (state === 'error' ? 'bad' : 'good');   // 取消照代码画绿点(SPEC §1.2)
      this.items.dot.el.setAttribute('data-tone', tone);
      this.items.sEnd.el.textContent = o.text && state === 'error' ? o.text
        : (o.label || (state === 'done' ? this.str.done : state === 'cancel' ? this.str.cancel : this.str.error));
      this.result = state === 'done' ? (o.text != null ? String(o.text) : this.result) : '';
    }
    if (state === 'starting') { this.fin = ''; this.vol = ''; this.result = ''; }
    this.state = state;

    if (!this.shown) {
      this.shown = true;
      if (isReduced()) this.panelOp.snap(1); else this.panelOp.go(1, t, MOTION.hudShow, 0, easeOut);
      this.panelY.snap(0);                       // 出现不位移
    }
    this._applyKeys(this._keysFor(state), animate);
    this._syncCaption(animate);
    wake();
    return this;
  };

  Capsule.prototype._keysFor = function (state) {
    switch (state) {
      case 'starting': return ['x', 'sStart'];
      case 'listening': return this.mode === 'dictation' ? ['x', 'wave', 'clock', 'check'] : ['x', 'chip', 'wave', 'clock', 'check'];
      case 'processing': return ['x', 'sProc'];
      default: return ['dot', 'sEnd'];
    }
  };

  Capsule.prototype._width = function (key) {
    var it = this.items[key];
    return it.fixedW ? it.fixedW * this.u : it.el.offsetWidth;
  };

  /* 量宽 → 每件按锚点定位(✕ / 点贴左,✓ 贴右,其余贴中线)→ 胶囊宽度走弹簧 */
  Capsule.prototype._applyKeys = function (keys, animate) {
    var t = now(), u = this.u, pad = 12 * u, gap = 12 * u, i, k, it;
    this.keys = keys;
    for (k in this.items) {
      it = this.items[k];
      var want = keys.indexOf(k) !== -1;
      if (want) it.el.classList.add('is-live');      // 先让它进排版再量
    }
    var ws = [], W = pad * 2;
    for (i = 0; i < keys.length; i++) { ws[i] = this._width(keys[i]); W += ws[i] + (i ? gap : 0); }
    var x = pad;
    for (i = 0; i < keys.length; i++) {
      this._place(this.items[keys[i]], x, ws[i], W);
      x += ws[i] + gap;
    }
    this.pillW.set(W, t, !animate);
    for (k in this.items) {
      it = this.items[k];
      var on = keys.indexOf(k) !== -1;
      if (it.plain && on !== it.want) {
        it.want = on;
        if (on) it.live = true;
        it.opSp.set(on ? 1 : 0, t, !animate);
      } else if (on && !it.want) {
        it.want = true; it.live = true;
        if (!animate) { it.op.snap(1); it.sc.snap(1); }
        else {
          if (it.op.value(t) <= 0.01) it.sc.snap(MOTION.contentIn.scale);
          it.op.go(1, t, MOTION.contentIn.dur, MOTION.contentIn.delay, easeOut);
          it.sc.go(1, t, MOTION.contentIn.dur, MOTION.contentIn.delay, easeOut);
        }
      } else if (!on && it.want) {
        it.want = false;
        if (!animate) { it.op.snap(0); it.sc.snap(1); }
        else {
          it.op.go(0, t, MOTION.contentOut.dur, 0, easeIn);
          it.sc.go(MOTION.contentOut.scale, t, MOTION.contentOut.dur, 0, easeIn);
        }
      } else if (!on && !it.live) {
        it.el.classList.remove('is-live');
      }
    }
  };

  Capsule.prototype._place = function (it, X, w, W) {
    var s = it.el.style;
    if (it.anchor === 'left') {
      s.left = X + 'px'; s.right = 'auto'; s.transformOrigin = '0 50%';
    } else if (it.anchor === 'right') {
      s.left = 'auto'; s.right = (W - X - w) + 'px'; s.transformOrigin = '100% 50%';
    } else {
      s.left = 'calc(50% + ' + (X - W / 2) + 'px)'; s.right = 'auto'; s.transformOrigin = '50% 50%';
    }
  };

  /* 字体到了 / 文案变了:按当前件重新量,宽度走弹簧(看不见时直接落) */
  Capsule.prototype._remeasure = function () {
    if (!this.keys.length) return;
    var t = now();
    this._applyKeys(this.keys, !isReduced() && this.panelOp.value(t) > 0.001);
    this._syncCaption(false);
    wake();
  };

  /* ── 整理中 · Ns · ESC 取消(HUD.swift:425–427)── */
  Capsule.prototype._renderProc = function () {
    var n = Math.max(0, Math.floor(this.procSeconds));
    this.items.sProc.el.textContent = this.procLabel + ' · ' + n + 's · ' + this.str.esc;
  };
  Capsule.prototype.setProcessingSeconds = function (sec) {
    var before = Math.floor(this.procSeconds);
    this.procSeconds = sec;
    if (Math.floor(sec) !== before) {
      this._renderProc();
      if (this.state === 'processing') this._remeasure();
    }
    return this;
  };

  /* ── 电平 / 计时 / 字幕 ── */
  Capsule.prototype.setLevel = function (v) { this.level = clamp01(+v || 0); wake(); return this; };

  Capsule.prototype.setClock = function (sec) {
    var s = Math.max(0, Math.floor(sec || 0));
    var str = Math.floor(s / 60) + ':' + pad2(s % 60);
    if (str === this.clockStr) return this;
    var lenChanged = str.length !== this.clockStr.length;
    var t = now();
    this._setClockText(str, !isReduced() && this.items.clock.want && this.panelOp.value(t) > 0.001);
    if (lenChanged && this.state === 'listening') this._remeasure();
    wake();
    return this;
  };

  Capsule.prototype._setClockText = function (str, animate) {
    var box = this.items.clock.el, t = now(), i;
    if (this.cells.length !== str.length) {
      box.textContent = '';
      this.cells = [];
      for (i = 0; i < str.length; i++) {
        var c = el('span', 'mc-cell' + (/\d/.test(str[i]) ? ' is-digit' : ''), box);
        var ghost = el('span', 'mc-ghost', c); ghost.textContent = /\d/.test(str[i]) ? '0' : str[i];
        var a = el('span', '', c), b = el('span', '', c);
        this.cells.push({ ch: '', a: a, b: b, sp: new Spring(MOTION.state, 1, 0.002) });
      }
      animate = false;
    }
    for (i = 0; i < str.length; i++) {
      var cell = this.cells[i], ch = str[i];
      if (cell.ch === ch) continue;
      cell.a.textContent = cell.ch;   // 旧字往上走
      cell.b.textContent = ch;        // 新字从下面上来
      cell.ch = ch;
      if (animate) cell.sp.from(0, 1, t); else cell.sp.set(1, t, true);
      cell.last = -1;
    }
    this.clockStr = str;
  };

  Capsule.prototype.setCaption = function (fin, vol) {
    this.fin = fin || ''; this.vol = vol || '';
    var t = now();
    this._syncCaption(!isReduced() && this.panelOp.value(t) > 0.001);
    wake();
    return this;
  };
  Capsule.prototype.setResult = function (text) {
    this.result = text || '';
    this._syncCaption(!isReduced() && this.panelOp.value(now()) > 0.001);
    wake();
    return this;
  };

  /* 字幕卡:录音 / 整理中 = 两态卡(宽按字量 120–360,高封顶 68,旧行从顶上滚走);
     落字后 = 最终插入的文字;取消 / 出错 = 清空。文字瞬时,只有框走弹簧。 */
  Capsule.prototype._syncCaption = function (animate) {
    if (this.captionPos === 'none') return;
    var t = now(), u = this.u;
    var liveOn = (this.state === 'listening' || this.state === 'processing') && !!(this.fin || this.vol);
    var doneOn = this.state === 'done' && !!this.result;
    if (liveOn) {
      if (this.finEl.textContent !== this.fin) this.finEl.textContent = this.fin;
      if (this.volEl.textContent !== this.vol) this.volEl.textContent = this.vol;
      this.measure.textContent = this.fin + this.vol;
      var rootW = this.root.clientWidth || 9999;
      var maxW = Math.max(60 * u, Math.min(360 * u, rootW - 28 * u));
      var cw = Math.min(maxW, Math.max(120 * u, Math.ceil(this.measure.offsetWidth) + 2));
      this.liveIn.style.width = cw + 'px';
      var LH = 20.5 * u, lines = Math.max(1, Math.round(this.liveIn.offsetHeight / LH));
      var ch = Math.min(68 * u, lines * LH - 4.5 * u);
      var appearing = this.liveOp.target < 0.5;
      this.liveW.set(cw + 28 * u, t, !animate || appearing);
      this.liveH.set(ch + 18 * u, t, !animate || appearing);
    }
    if (doneOn && this.doneIn.textContent !== this.result) this.doneIn.textContent = this.result;
    this.liveOp.set(liveOn ? 1 : 0, t, !animate);
    /* 交接:字幕卡还看得见(>0.05)时结果卡先不进,等 _frame 看到它淡下去再放行 ——
       两段字叠在一起会读成乱码(评审 2026-10-13 第 3 条) */
    this._doneWait = doneOn && animate && clamp01(this.liveOp.value(t)) >= 0.05;
    if (!this._doneWait) this.doneOp.set(doneOn ? 1 : 0, t, !animate);
  };

  /* ── 主题色(画布要用) ── */
  Capsule.prototype.refreshTheme = function () { this._colors = null; wake(); };
  Capsule.prototype._color = function () {
    if (!this._colors) {
      var cs = global.getComputedStyle(this.root);
      this._colors = {
        ink: cs.getPropertyValue('--mc-ink').trim() || '#1B1B1F',
        coral: cs.getPropertyValue('--mc-coral').trim() || '#E2531F'
      };
    }
    return this._colors;
  };

  /* ── 每帧 ── */
  Capsule.prototype._frame = function (t) {
    var busy = false, k, it;
    var pOp = this.panelOp.value(t), pY = this.panelY.value(t);
    if (this.panelOp.busy(t) || this.panelY.busy(t)) busy = true;
    if (pY !== this._lastY) { this.panel.style.transform = pY ? 'translateY(' + pY + 'px)' : ''; this._lastY = pY; }
    if (pOp <= 0.001 && !this.shown) {
      if (this._lastPOp !== 0) {
        this.pill.style.opacity = '0'; this.liveCard.style.opacity = '0'; this.doneCard.style.opacity = '0';
        this.liveCard.classList.remove('is-live'); this.doneCard.classList.remove('is-live');
        this._lastPOp = 0;
      }
      return busy;
    }
    this._lastPOp = pOp;
    this.pill.style.opacity = String(pOp);

    var w = this.pillW.value(t);
    if (!this.pillW.done) busy = true;
    if (w !== this._lastW) { this.pill.style.width = w + 'px'; this.pill.style.marginLeft = (-w / 2) + 'px'; this._lastW = w; }

    for (k in this.items) {
      it = this.items[k];
      if (!it.live) continue;
      var op, sc, moving;
      if (it.plain) { op = clamp01(it.opSp.value(t)); sc = 1; moving = !it.opSp.done; }
      else { op = it.op.value(t); sc = it.sc.value(t); moving = it.op.busy(t) || it.sc.busy(t); }
      if (moving) busy = true;
      if (op !== it.lastOp) { it.el.style.opacity = String(op); it.lastOp = op; }
      if (sc !== it.lastSc) { it.el.style.transform = sc === 1 ? '' : 'scale(' + sc + ')'; it.lastSc = sc; }
      if (!it.want && op <= 0.001 && !moving) {
        it.live = false; it.el.classList.remove('is-live'); it.lastOp = -1;
      }
    }

    if (this.items.wave.live) {
      this._drawWave(t);
      if (!isReduced()) busy = true;
    } else {
      this._waveT = 0;
    }

    if (this.items.clock.live) {
      var dy = 10 * this.u;
      for (var i = 0; i < this.cells.length; i++) {
        var cell = this.cells[i], p = cell.sp.value(t);
        if (!cell.sp.done) busy = true;
        if (p === cell.last) continue;
        cell.last = p;
        var q = clamp01(p);
        cell.a.style.opacity = String(1 - q);
        cell.a.style.transform = q ? 'translateY(' + (-p * dy) + 'px)' : '';
        cell.b.style.opacity = String(q);
        cell.b.style.transform = p === 1 ? '' : 'translateY(' + ((1 - p) * dy) + 'px)';
      }
    }

    if (this.captionPos !== 'none') {
      var lo = clamp01(this.liveOp.value(t));
      if (this._doneWait) {
        busy = true;
        if (lo < 0.05) { this._doneWait = false; this.doneOp.set(1, t, false); }
      }
      var dO = clamp01(this.doneOp.value(t));
      if (!this.liveOp.done || !this.doneOp.done || !this.liveW.done || !this.liveH.done) busy = true;
      this.liveCard.classList.toggle('is-live', lo > 0.001);
      this.doneCard.classList.toggle('is-live', dO > 0.001);
      this.liveCard.style.opacity = String(lo * pOp);
      this.doneCard.style.opacity = String(dO * pOp);
      if (lo > 0.001) {
        this.liveCard.style.width = this.liveW.value(t) + 'px';
        this.liveCard.style.height = this.liveH.value(t) + 'px';
      }
    }
    return busy;
  };

  /* 液态带子:珊瑚光晕(amp > 0.12 才有)垫底 → 墨色填充 → 墨色描边 1.1(HUD.swift 波形那段) */
  Capsule.prototype._drawWave = function (t) {
    var u = this.u, Ww = this.waveW, H = 24, bx = 16, by = 9;   // 画布四周留出光晕
    var c = this.canvas, dpr = global.devicePixelRatio || 1;
    var cssW = (Ww + 2 * bx) * u, cssH = (H + 2 * by) * u;
    var bw = Math.max(1, Math.round(cssW * dpr)), bh = Math.max(1, Math.round(cssH * dpr));
    if (c.width !== bw || c.height !== bh) {                     // 两边都比,每帧都比
      c.width = bw; c.height = bh;
      c.style.width = cssW + 'px'; c.style.height = cssH + 'px';
      c.style.left = (-bx * u) + 'px'; c.style.top = (-by * u) + 'px';
    }
    var target = this.state === 'listening' && this.shown ? this.level : 0;
    var amp, phase;
    if (isReduced()) {
      amp = target; phase = 1.7;                                   // 静态终态(Mac 出图钉的相位)
    } else {
      var dt = this._waveT ? Math.min(0.1, Math.max(0, (t - this._waveT) / 1000)) : 1 / 60;
      this.amp += (target - this.amp) * (1 - Math.exp(-dt / 0.067));   // = Mac 60Hz 下每帧 0.22
      if (this.amp < 0.002) this.amp = 0;
      amp = this.amp;
      phase = (t / 1000) * 5.5;
    }
    this._waveT = t;
    var g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, bw, bh);                                     // 擦整块
    var sx = bw / (Ww + 2 * bx), sy = bh / (H + 2 * by);
    g.setTransform(sx, 0, 0, sy, bx * sx, by * sy);
    var path = liquidPath(Ww, H, amp, phase);
    var col = this._color();
    if (amp > 0.12) {
      // blur(8):用阴影画(各家浏览器都支持);本体画到画布外,只让阴影落回原处
      var off = bw + 64;
      g.save();
      g.globalAlpha = (amp - 0.12) * 0.62;
      g.shadowColor = col.coral;
      g.shadowBlur = 16 * sy;
      g.shadowOffsetX = off;
      g.translate(-off / sx, 0);
      g.fillStyle = '#000';
      g.fill(path);
      g.restore();
    }
    g.globalAlpha = 0.16 + amp * 0.2;
    g.fillStyle = col.ink;
    g.fill(path);
    g.globalAlpha = 0.32 + amp * 0.42;
    g.strokeStyle = col.ink;
    g.lineWidth = 1.1;
    g.stroke(path);
    g.globalAlpha = 1;
  };

  Capsule.prototype.destroy = function () {
    if (this._io) this._io.disconnect();
    var i = instances.indexOf(this);
    if (i !== -1) instances.splice(i, 1);
    this.root.textContent = '';
    this.root.classList.remove('mc');
  };

  /* ── 公开 ── */
  global.MurmurCapsule = {
    mount: function (root, opts) { return new Capsule(root, opts); },
    DWELL: DWELL,
    MOTION: MOTION,
    math: { offset: offset, liquidPath: liquidPath },
    now: now,
    /* 测试 / 截图专用:手动时钟,逐帧推进(每步 1/60 s),onStep 在每帧画之前调 */
    test: {
      manual: function (on, t0) { Clock.manual = !!on; Clock.t = t0 || 0; },
      reduced: function (v) { forceReduced = v == null ? null : !!v; },
      advance: function (ms, onStep) {
        var step = 1000 / 60, end = Clock.t + ms;
        while (Clock.t < end - 1e-6) {
          Clock.t = Math.min(end, Clock.t + step);
          if (onStep) onStep(Clock.t);
          for (var i = 0; i < instances.length; i++) instances[i]._frame(Clock.t);
        }
      }
    }
  };
})(window);
