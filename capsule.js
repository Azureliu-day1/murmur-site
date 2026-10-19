/* ─────────────────────────────────────────────────────────────────────────
   Murmur 录音条 · 网页复刻(capsule.js)—— 首屏、少改一遍、三个功能区、对着 AI 说话、技能页共用
   依据:App 现在装着的样子 = 录音条 v2「一块到底」(HUD-A 2026-10-13 + 整理中变体 1 HUD-PROC-1 2026-10-14)。
   数值逐项抄自 murmur-ime 的 Sources/Murmur/UI/HUDFaceV2.swift(几何 / 动效 / 每一态的样子)、
   HUD.swift(字幕字号行距、圆按钮)、HUDCopy.swift + Core/HUDEnding.swift(每一个字)、
   WaveMath.swift(液带 + 圆头)、GlassBackground.swift(玻璃)、DesignSystem.swift(颜色 / 曲线)。
   ⛔ 改数值先对 App 源码;App 的 pt 在网页上 1:1 写成 px(再乘尺寸系数 u)。

   用法(对外接口和旧版一样)
     var cap = MurmurCapsule.mount(el, { size: 'full' | 'mini', caption: 'above' | 'below' | 'none',
                                         mode: 'dictation' | 'translate' | 'ask' | 'edit', lang: 'zh' | 'en',
                                         scale: 0.8 });
     cap.setState('starting');                         // ✕ · 一根细线(慢于 600ms 才写「开麦中」)
     cap.setState('listening', { level: 0.6 });        // 字幕在上 · ✕ · 液带 · 计时 · 珊瑚 ✓
     cap.setLevel(0.42); cap.setClock(2.3); cap.setCaption('定稿的', '没定稿的');
     cap.setState('processing');                       // 一个字都不写:控件淡出,液带收成细平线,1.2s 后线上一颗慢亮点
     cap.setState('done', { text: '最终插入的文字' });  // 原话原位淡出、整理后的句子原位淡入,右槽「✓ 已插入」
     cap.setState('cancel');  cap.setState('error', { text: '解释句' });
     cap.setState('hidden');                           // 淡出 + 下沉 6pt
   旧参数照收不报错:processing 的 seconds / label、setProcessingSeconds()、waveWidth —— App 整理中不写字,所以不画。
   停留时长(宿主自己排):MurmurCapsule.DWELL = { starting, done, cancel, error }。

   纪律
   - 无外部库;不写内联 <style>、不用 style 属性字符串(只走 CSSOM),合站点 CSP。
   - 所有动效按时间算:减弱动效直接落终态(液带画一帧静止的,不出亮点);页面不可见 / 滚出视口停画。
   - 画布每帧按真实尺寸 × dpr 设大小、擦整块。
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

  /* ── 几何(HUDFaceV2.swift HUDViewV2)── */
  var G = {
    width: 372, rowH: 42, rowInset: 12, textInset: 16, gap: 12,   // DS.Space.m = 12
    btn: 24, btnTop: 9, lineH: 24,                                 // 圆按钮 24;中间那根线的格子高 24
    textTop: 11, textBottom: 2,                                    // 文字区 .padding(.top, 11).padding(.bottom, 2)
    radiusText: 18, radiusRow: 21,                                 // 有文字区 18,只有一行时全圆(半高 21)
    capFont: 13.5, capSpacing: 4.5, capMax: 68,                    // HUDView.captionFontSize / LineSpacing / MaxHeight
    capLine: 16.1, capOneLine: 17,                                 // SF 13.5 的自然行高 ≈ 16.1;一行 = ceil(asc − desc) = 17
    slotGap: 5,                                                    // 「✓ 已插入」里 ✓ 与字的间距
    dot: 2.5,                                                      // HUDProcTimeline.dotDiameter
    endCap: 6                                                      // LiquidWave.endCap radius
  };
  /* 整理中时间表(HUDProcTimeline):1.2s 后出亮点,一个来回 2.4s;收尾 400ms 后把原话那一层拿掉 */
  var PROC = { dotDelay: 1200, dotPeriod: 2400, heldRawRelease: 400, openingSlow: 600 };

  /* ── DS.Motion(DesignSystem.swift 123–159 行)。quick / state / settle 用 App 自己出图用的近似
        (HUDProcTimeline.look:quick = easeOut 0.12;state / settle = 时长 0.22 / 0.30 的临界阻尼) ── */
  var MOTION = {
    hudShow: 120,                 // 面板出现:alpha 0→1,easeOut,不位移
    hudHide: 180,                 // 面板收起:alpha →0 + 下沉 6pt,easeIn
    hudHideDrop: 6,
    stretch: { response: 0.42, damping: 0.88 },   // 文字区出现 / 变高:不回弹
    quick: 120, state: 220, settle: 300,
    flatDelay: 80, doneDelay: 80                  // 中线落平慢 0.08;右槽收尾词慢 0.08
  };
  /* 停留(DictationEngine.swift):完成 1.8s,取消 0.9s,出错 2.5s;开麦段约 300ms */
  var DWELL = { starting: 300, done: 1800, cancel: 900, error: 2500 };

  /* ── 每一个字(HUDCopy.swift / Core/HUDEnding.swift)── */
  var STR = {
    zh: {
      opening: '开麦中',
      word: { done: '已插入', cancel: '已取消', error: '没有成功' },
      mode: { translate: '翻译', edit: '改写', ask: '随心问' }
    },
    en: {
      opening: 'Opening mic',
      word: { done: 'Inserted', cancel: 'Cancelled', error: "Didn't work" },
      mode: { translate: 'Translate', edit: 'Rewrite', ask: 'Ask' }
    }
  };
  var MODES = { dictation: 1, translate: 1, ask: 1, edit: 1 };

  /* ── 曲线 ── */
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
  function crit(x) {                                   // 临界阻尼,x = 已过时长 / 档位时长;x ≥ 2 落定
    if (x <= 0) return 0;
    if (x >= 2) return 1;
    var w = 2 * Math.PI * x;
    return 1 - (1 + w) * Math.exp(-w);
  }
  var CURVE = {
    quick: { dur: MOTION.quick, ease: function (p) { return 1 - Math.pow(1 - p, 2.2); } },
    state: { dur: MOTION.state * 2, ease: function (p) { return crit(p * 2); } },
    settle: { dur: MOTION.settle * 2, ease: function (p) { return crit(p * 2); } }
  };

  /* ── 补间 ── */
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
  /* 按 DS 档位走到 to(目标没变就不重起);animate = false 直接落 */
  Tween.prototype.aim = function (to, t, curve, animate, delay) {
    if (!animate) { this.snap(to); return; }
    if (this.to === to) return;
    var c = CURVE[curve];
    this.go(to, t, c.dur, delay || 0, c.ease);
  };

  /* ── 弹簧(解析解,可中途改目标并保留速度 = SwiftUI 的弹簧手感)── */
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

  /* ── 液态带子(WaveMath.swift `LiquidWave`,逐字照抄;roundedEnds = 两端圆头)── */
  function offset(k, phase, amp, H, side) {
    var taper = 0.4 + 0.6 * Math.sin(Math.PI * k);
    var ripple = 0.52 + 0.30 * Math.sin(k * 7 + phase + side) + 0.18 * Math.sin(k * 13.5 - phase * 0.7 + side * 1.4);
    return (H * 0.5) * (0.3 + 0.7 * amp) * taper * ripple;
  }
  function endCap(x, W, r) {
    var d = Math.min(x, W - x);
    if (d >= r) return 1;
    if (d <= 0) return 0;
    var t = 1 - d / r;
    return Math.sqrt(Math.max(0, 1 - t * t));
  }
  /* x 处上 / 下缘相对中线的偏移(上为负)—— HUDVoiceGeometry.edges */
  function edges(x, W, H, amp, phase, capR) {
    var k = x / Math.max(1, W), cap = endCap(x, W, capR);
    return [-offset(k, phase, amp, H, 0) * cap, offset(k, phase, amp, H, 1.7) * cap];
  }
  /* 液带轮廓,厚度按 thickness 向它自己的中线收拢(1 = 原样,0 = 一根线)—— HUDVoiceGeometry.band */
  function bandPath(W, H, amp, phase, thickness, step, capR) {
    var p = new Path2D(), mid = H / 2, x = 0, e, mean;
    while (x <= W) {
      e = edges(x, W, H, amp, phase, capR); mean = (e[0] + e[1]) / 2;
      var y = mid + mean + (e[0] - mean) * thickness;
      if (x === 0) p.moveTo(x, y); else p.lineTo(x, y);
      x += step;
    }
    x = W;
    while (x >= 0) {
      e = edges(x, W, H, amp, phase, capR); mean = (e[0] + e[1]) / 2;
      p.lineTo(x, mid + mean + (e[1] - mean) * thickness);
      x -= step;
    }
    p.closePath();
    return p;
  }
  /* 中线:flat 0 = 跟液带中线弯,1 = 平线;两端各让出半个线宽 —— HUDVoiceGeometry.centerline */
  function centerPath(W, H, amp, phase, flat, lw, step, capR) {
    var p = new Path2D(), mid = H / 2, inset = lw / 2, span = Math.max(0, W - 2 * inset), x = 0, first = true;
    for (;;) {
      var e = edges(x, W, H, amp, phase, capR);
      var y = mid + (e[0] + e[1]) / 2 * (1 - flat);
      var px = inset + x / Math.max(1, W) * span;
      if (first) p.moveTo(px, y); else p.lineTo(px, y);
      first = false;
      if (x >= W) break;
      x = Math.min(W, x + step);
    }
    return p;
  }
  /* 旧接口(不带圆头的原形),留给外部取数 */
  function liquidPath(W, H, amp, phase) { return bandPath(W, H, amp, phase, 1, 3, 0); }

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
  function setOp(e, v, cache, key) {
    if (cache[key] === v) return;
    cache[key] = v;
    e.style.opacity = String(v);
    e.style.visibility = v > 0.001 ? 'visible' : 'hidden';
  }

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

  /* ── 实例 ── */
  function Capsule(root, opts) {
    opts = opts || {};
    var self = this;
    this.root = root;
    this.size = opts.size === 'mini' ? 'mini' : 'full';
    this.u = opts.scale || (this.size === 'mini' ? 36 / 42 : 1);
    this.mode = MODES[opts.mode] ? opts.mode : 'dictation';
    var htmlLang = (doc.documentElement.getAttribute('lang') || '').toLowerCase();
    this.lang = opts.lang === 'en' || (opts.lang !== 'zh' && htmlLang.indexOf('en') === 0) ? 'en' : 'zh';
    this.str = STR[this.lang];
    this.captionPos = opts.caption || (this.size === 'mini' ? 'none' : 'above');

    this.state = 'hidden';
    this.shown = false;
    this.level = 0;
    this.amp = 0; this.phase = 1.7 * 5.5;     // 松手时记下的液带形状(HUDVoiceMemo 默认值)
    this._waveT = 0;
    this.fin = ''; this.vol = '';
    this.heldRaw = ''; this.rawHeld = false;
    this.result = ''; this.detail = ''; this.source = '';
    this.tone = 'done';
    this.tState = 0;
    this.dotOn = false; this.dotK = 0;
    this.openOn = false;
    this.inView = true;
    this._colors = null;
    this._c = {};                              // 上一帧写过的样式(没变就不碰 DOM)

    /* DOM */
    root.classList.add('mc');
    root.setAttribute('data-size', this.size);
    root.setAttribute('data-caption', this.captionPos);
    if (opts.scale) root.style.setProperty('--mc-u', this.u + 'px');
    // 留位:按钮行 42 + 文字区最高 11 + 68 + 2
    root.style.setProperty('--mc-reserve', String(G.rowH + (this.captionPos === 'none' ? 0 : G.textTop + G.capMax + G.textBottom)));
    if (!root.hasAttribute('role')) root.setAttribute('aria-hidden', 'true');

    this.panel = el('div', 'mc-panel mc-glass', root);
    this.text = el('div', 'mc-text', this.panel);
    this.rawBox = el('div', 'mc-raw', this.text);
    this.rawIn = el('div', 'mc-raw-in', this.rawBox);
    this.finEl = el('span', 'mc-fin', this.rawIn);
    this.volEl = el('span', 'mc-vol', this.rawIn);
    this.res = el('div', 'mc-res', this.text);
    this.srcEl = el('div', 'mc-src', this.res);
    this.resEl = el('div', 'mc-main', this.res);
    this.detEl = el('div', 'mc-detail', this.res);

    this.row = el('div', 'mc-row', this.panel);
    this.canvas = el('canvas', 'mc-line', this.row);
    this.xEl = el('div', 'mc-btn mc-x', this.row);
    this.modeEl = el('div', 'mc-word mc-mode', this.row);
    this.openEl = el('div', 'mc-word mc-open', this.row);
    this.clockEl = el('div', 'mc-clock', this.row);
    this.checkEl = el('div', 'mc-btn mc-check', this.row);
    this.slotEl = el('div', 'mc-slot', this.row);
    this.slotTick = el('span', 'mc-tick', this.slotEl);
    this.slotWord = el('span', 'mc-word-in', this.slotEl);

    var meas = el('div', 'mc-measure', root);
    this.measCap = el('div', 'mc-m-cap', meas);
    this.measWord = el('span', 'mc-word', meas);

    // SF Symbol xmark / checkmark 10.5pt semibold 的近似:描边、圆头
    this.xEl.appendChild(icon('M8.7 8.7 L15.3 15.3 M15.3 8.7 L8.7 15.3', 1.6));
    this.checkEl.appendChild(icon('M7.6 12.4 L10.7 15.4 L16.4 8.8', 1.8));
    this.slotTick.appendChild(icon('M2.4 13.6 L8.4 20.2 L21.8 3.4', 2.6));   // ✓ 10.5pt semibold:几乎占满 11pt 的格
    this.modeEl.textContent = this.mode === 'dictation' ? '' : this.str.mode[this.mode];
    this.openEl.textContent = this.str.opening;

    this.clockStr = '';
    this.cells = [];
    this._setClockText('0:00', false);

    /* 每一层的样子(HUDProcTimeline.Look)+ 面板 */
    this.panelOp = new Tween(0);
    this.panelY = new Tween(MOTION.hudHideDrop * this.u);
    this.areaH = new Spring(MOTION.stretch, 0, 0.25);    // 文字区(含上下内距)的高度
    this.L = {
      controls: new Tween(0),   // ✕ / 模式词 / 计时 / 珊瑚 ✓
      voice: new Tween(0),      // 开麦那一行 → 听写那一行(交叉淡)
      open: new Tween(0),       // 「开麦中」
      band: new Tween(1),       // 液带厚度
      flat: new Tween(0),       // 中线落平
      dot: new Tween(0),        // 慢亮点
      lineOn: new Tween(1),     // 线整体(取消那一档不带线)
      danger: new Tween(0),     // 失败那一档的淡 danger 线
      area: new Tween(0),       // 文字区透明度
      raw: new Tween(1),        // 原话那一层
      result: new Tween(0),     // 整理后那句话
      done: new Tween(0),       // 右槽收尾词
      lineX: new Tween(0), lineW: new Tween(0)   // 中间那根线的位置(收尾时向左伸到行首)
    };
    this.W = 0;

    if (global.IntersectionObserver) {
      this._io = new IntersectionObserver(function (es) {
        self.inView = es[es.length - 1].isIntersecting;
        if (self.inView) wake();
      }, { rootMargin: '64px' });
      this._io.observe(root);
    }
    if (global.ResizeObserver) {
      this._ro = new ResizeObserver(function () { self._remeasure(); });
      this._ro.observe(root);
    }
    instances.push(this);
    this._relayout(false);
    wake();
  }

  Capsule.prototype._active = function () {
    return Clock.manual || (this.inView && !doc.hidden);
  };
  Capsule.prototype._animating = function (t) {
    return !isReduced() && this.panelOp.value(t) > 0.001;
  };

  /* ── 状态 ── */
  Capsule.prototype.setState = function (state, o) {
    o = o || {};
    var t = now();
    if (o.level != null) this.level = clamp01(+o.level);
    if (state === this.state && this.shown && state !== 'done' && state !== 'error') { wake(); return this; }
    if (state === 'hidden') {
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
    var animate = this._animating(t);
    var prev = this.state;
    var idle = state === 'done' || state === 'cancel' || state === 'error';

    if (state === 'starting') { this.fin = ''; this.vol = ''; this.heldRaw = ''; this.rawHeld = false; this.result = ''; this.detail = ''; this.source = ''; }
    if (state === 'listening') { this.heldRaw = ''; this.rawHeld = false; this.result = ''; this.detail = ''; this.source = ''; }
    if (idle) {
      // 原话:松手时(或直接收尾时)记下,收尾时在原位淡出,400ms 后从布局里拿掉
      if (prev === 'listening' || prev === 'processing') this.heldRaw = this.fin + this.vol;
      this.rawHeld = !!this.heldRaw;
      this.tone = state === 'done' ? (o.tone === 'check' || o.tone === 'neutral' || o.tone === 'bad' ? o.tone : 'done')
        : state === 'cancel' ? 'neutral' : 'bad';
      this.slotWord.textContent = o.label || this.str.word[state];
      this.slotEl.setAttribute('data-tone', this.tone);
      this.result = state === 'done' ? (o.text != null ? String(o.text) : this.result) : '';
      this.detail = state === 'error' && o.text ? String(o.text) : (o.detail ? String(o.detail) : '');
      // 翻译完成:原文小一号压透明度在上,译文是主行(HUDFaceV2 endingText)
      this.source = state === 'done' && this.mode === 'translate' && this.result ? this.heldRaw : '';
      this.fin = ''; this.vol = '';
    }
    if (state === 'processing' && prev !== 'processing') this.dotOn = false;
    this.state = state;
    this.tState = t;
    this._c.H = -1; this._c.heldH = -1;
    this.openOn = state === 'starting' && isReduced();

    if (!this.shown) {
      this.shown = true;
      if (isReduced()) this.panelOp.snap(1); else this.panelOp.go(1, t, MOTION.hudShow, 0, easeOut);
      this.panelY.snap(0);                       // 出现不位移
    }
    this._renderText();
    this._applyLook(t, animate);
    this._relayout(animate);
    wake();
    return this;
  };

  /* 每一态的终值(HUDProcTimeline.target)→ 各层按自己的档走过去 */
  Capsule.prototype._applyLook = function (t, animate) {
    var L = this.L, s = this.state;
    var live = s === 'starting' || s === 'listening';
    var proc = s === 'processing';
    var idle = s === 'done' || s === 'cancel' || s === 'error';
    var ctl = live ? 1 : 0;
    L.controls.aim(ctl, t, ctl ? 'state' : 'quick', animate);
    L.voice.aim(s === 'starting' ? 0 : 1, t, 'state', animate);
    L.open.aim(this.openOn ? 1 : 0, t, 'state', animate);
    L.band.aim(live ? 1 : 0, t, 'state', animate);
    L.flat.aim(live ? 0 : 1, t, 'settle', animate, MOTION.flatDelay);
    var dotT = proc && this.dotOn ? 1 : 0;
    L.dot.aim(dotT, t, dotT ? 'state' : 'quick', animate);
    L.lineOn.aim(idle && this.tone === 'neutral' ? 0 : 1, t, 'quick', animate);
    L.danger.aim(idle && this.tone === 'bad' ? 1 : 0, t, 'settle', animate);
    L.raw.aim(idle ? 0 : 1, t, 'state', animate);
    L.result.aim(idle ? 1 : 0, t, 'settle', animate);
    L.done.aim(idle ? 1 : 0, t, 'state', animate, idle ? MOTION.doneDelay : 0);
    L.area.aim(this._hasText() ? 1 : 0, t, 'state', animate);
  };

  Capsule.prototype._hasText = function () {
    if (this.captionPos === 'none') return false;
    var s = this.state;
    if (s === 'listening' || s === 'processing') return !!(this.fin || this.vol);
    if (s === 'done' || s === 'cancel' || s === 'error') return !!(this.result || this.detail);
    return false;
  };

  /* ── 量 ── */
  Capsule.prototype._lines = function (text, w) {
    if (!text) return 0;
    this.measCap.style.width = w + 'px';
    this.measCap.textContent = text;
    var LH = (G.capLine + G.capSpacing) * this.u;
    return Math.max(1, Math.round(this.measCap.offsetHeight / LH));
  };
  /* 字幕在定宽下要多高:一行 17,多行 = n × 16.1 + (n − 1) × 4.5,封顶 68(HUDViewV2.captionHeight) */
  function capHeight(n, cap) {
    if (n <= 1) return G.capOneLine;
    var h = Math.ceil(n * G.capLine + (n - 1) * G.capSpacing);
    return cap ? Math.min(G.capMax, h) : h;
  }
  Capsule.prototype._wordW = function (e) { return e.offsetWidth; };

  /* 宽度、文字区高度、线的位置:状态 / 字 / 计时位数 / 容器宽度变了都重算 */
  Capsule.prototype._relayout = function (animate) {
    var t = now(), u = this.u, L = this.L;
    var rootW = this.root.clientWidth || G.width * u;
    var W = Math.min(G.width * u, rootW);
    if (W !== this.W) {
      this.W = W;
      this.panel.style.width = W + 'px';
      this.panel.style.marginLeft = (-W / 2) + 'px';
    }
    var textW = Math.max(40 * u, W - 2 * G.textInset * u);
    this.textW = textW;
    if (this._c.textW !== textW) { this._c.textW = textW; this.text.style.width = textW + 'px'; }

    /* 文字区 */
    var s = this.state, contentH = 0;
    if (this._hasText()) {
      if (s === 'listening' || s === 'processing') {
        this.rawH = capHeight(this._lines(this.fin + this.vol, textW), true) * u;
        contentH = this.rawH;
      } else {
        var resH = 0, gap = 4 * u;
        if (this.source) resH += 15 * u;   // 11.5pt 一行
        if (this.result) resH += (resH ? gap : 0) + capHeight(Math.min(3, this._lines(this.result, textW)), false) * u;
        if (this.detail) resH += (resH ? gap : 0) + 17 * u;   // 12.5pt 一行(行距 2)
        this.resH = resH;
        contentH = this.rawHeld && this.heldRaw ? Math.max(this.heldRawH || 0, resH) : resH;
      }
    }
    if ((s === 'listening' || s === 'processing') && this.rawH) this.heldRawH = this.rawH;
    var areaT = contentH ? contentH + (G.textTop + G.textBottom) * u : 0;
    this.areaH.set(areaT, t, !animate);           // 文字区出现 / 变高 / 消失:stretch(HUDViewV2 .animation(stretch, value: textAreaKey))

    /* 按钮行:✕ 簇贴左、计时 + ✓ 贴右,中间那根线吃掉剩下的宽度 */
    var pad = G.rowInset * u, gapX = G.gap * u, btn = G.btn * u;
    var idle = s === 'done' || s === 'cancel' || s === 'error';
    var x0, x1;
    if (idle) {
      x0 = pad;
      x1 = W - pad - this._wordW(this.slotEl) - gapX;
    } else {
      var modeW = this.mode === 'dictation' ? 0 : this._wordW(this.modeEl);
      x0 = pad + btn + gapX + (modeW ? modeW + gapX : 0);
      x1 = W - pad - btn - gapX - this._wordW(this.clockEl) - gapX;
      this._place(this.modeEl, pad + btn + gapX, 'left');
      this._place(this.clockEl, W - pad - btn - gapX, 'right');
    }
    this._place(this.xEl, pad, 'left');
    this._place(this.checkEl, W - pad, 'right');
    this._place(this.slotEl, W - pad, 'right');
    this._place(this.openEl, W - pad, 'right');
    var anim = animate && L.voice.value(t) > 0.01;
    L.lineX.aim(x0, t, 'settle', anim);
    L.lineW.aim(Math.max(0, x1 - x0), t, 'settle', anim);
  };

  Capsule.prototype._place = function (e, x, side) {
    var k = side + ':' + x;
    if (e._mcPlace === k) return;
    e._mcPlace = k;
    if (side === 'left') { e.style.left = x + 'px'; e.style.right = 'auto'; }
    else { e.style.left = 'auto'; e.style.right = (this.W - x) + 'px'; }
  };

  Capsule.prototype._remeasure = function () {
    var t = now();
    this._relayout(this._animating(t));
    wake();
  };

  /* ── 文字:瞬时(实时字幕不许滞后),只有框和透明度走动画 ── */
  Capsule.prototype._renderText = function () {
    var s = this.state, idle = s === 'done' || s === 'cancel' || s === 'error';
    var fin = idle ? this.heldRaw : this.fin, vol = idle ? '' : this.vol;
    if (this.finEl.textContent !== fin) this.finEl.textContent = fin;
    if (this.volEl.textContent !== vol) this.volEl.textContent = vol;
    // 暂定 = ink × .4,只在听写中;整理中两段都是 ink(已经不会再变了)
    this.rawIn.classList.toggle('is-live', s === 'listening');
    if (this.srcEl.textContent !== this.source) this.srcEl.textContent = this.source;
    if (this.resEl.textContent !== this.result) this.resEl.textContent = this.result;
    if (this.detEl.textContent !== this.detail) this.detEl.textContent = this.detail;
    this.srcEl.hidden = !this.source; this.resEl.hidden = !this.result; this.detEl.hidden = !this.detail;
  };

  /* ── 旧接口:整理中不写秒数(App 变体 1),收下不画 ── */
  Capsule.prototype.setProcessingSeconds = function () { return this; };

  /* ── 电平 / 计时 / 字幕 ── */
  Capsule.prototype.setLevel = function (v) { this.level = clamp01(+v || 0); wake(); return this; };

  Capsule.prototype.setClock = function (sec) {
    var s = Math.max(0, Math.floor(sec || 0));
    var str = Math.floor(s / 60) + ':' + pad2(s % 60);
    if (str === this.clockStr) return this;
    var lenChanged = str.length !== this.clockStr.length;
    var t = now();
    this._setClockText(str, this._animating(t) && this.L.controls.to > 0);
    if (lenChanged) this._relayout(this._animating(t));
    wake();
    return this;
  };

  /* 计时数字:每位一格,变了就滚(numericText 的近似;state 档) */
  Capsule.prototype._setClockText = function (str, animate) {
    var box = this.clockEl, t = now(), i;
    if (this.cells.length !== str.length) {
      box.textContent = '';
      this.cells = [];
      for (i = 0; i < str.length; i++) {
        var c = el('span', 'mc-cell' + (/\d/.test(str[i]) ? ' is-digit' : ''), box);
        var ghost = el('span', 'mc-ghost', c); ghost.textContent = /\d/.test(str[i]) ? '0' : str[i];
        var a = el('span', '', c), b = el('span', '', c);
        this.cells.push({ ch: '', a: a, b: b, tw: new Tween(1), last: -1 });
      }
      animate = false;
    }
    for (i = 0; i < str.length; i++) {
      var cell = this.cells[i], ch = str[i];
      if (cell.ch === ch) continue;
      cell.a.textContent = cell.ch;   // 旧字往上走
      cell.b.textContent = ch;        // 新字从下面上来
      cell.ch = ch;
      if (animate) { cell.tw.snap(0); cell.tw.go(1, t, CURVE.state.dur, 0, CURVE.state.ease); } else cell.tw.snap(1);
      cell.last = -1;
    }
    this.clockStr = str;
  };

  Capsule.prototype.setCaption = function (fin, vol) {
    fin = fin || ''; vol = vol || '';
    if (fin === this.fin && vol === this.vol) return this;
    this.fin = fin; this.vol = vol;
    var t = now(), animate = this._animating(t);
    if (this.state === 'listening' || this.state === 'processing') {
      this._renderText();
      this.L.area.aim(this._hasText() ? 1 : 0, t, 'state', animate);
      this._relayout(animate);
    }
    wake();
    return this;
  };
  Capsule.prototype.setResult = function (text) {
    this.result = text || '';
    var t = now();
    this._renderText();
    this.L.area.aim(this._hasText() ? 1 : 0, t, 'state', this._animating(t));
    this._relayout(this._animating(t));
    wake();
    return this;
  };

  /* ── 主题色(画布要用)── */
  Capsule.prototype.refreshTheme = function () { this._colors = null; wake(); };
  Capsule.prototype._color = function () {
    if (!this._colors) {
      var cs = global.getComputedStyle(this.root);
      var v = function (k, d) { return cs.getPropertyValue(k).trim() || d; };
      this._colors = {
        ink: v('--mc-ink', '#1B1B1F'),
        coral: v('--mc-coral', '#E2531F'),
        danger: v('--mc-danger', '#B3402E'),
        dotc: v('--mc-procdot', '#616161'),
        dark: v('--mc-dark', '0') === '1'
      };
    }
    return this._colors;
  };

  /* ── 每帧 ── */
  Capsule.prototype._frame = function (t) {
    var busy = false, c = this._c, L = this.L, u = this.u, k;
    var pOp = this.panelOp.value(t), pY = this.panelY.value(t);
    if (this.panelOp.busy(t) || this.panelY.busy(t)) busy = true;
    if (pY !== c.y) { this.panel.style.transform = pY ? 'translateY(' + pY + 'px)' : ''; c.y = pY; }
    if (pOp <= 0.001 && !this.shown) {
      if (c.pOp !== 0) { this.panel.style.opacity = '0'; this.panel.style.visibility = 'hidden'; c.pOp = 0; }
      return busy;
    }
    if (c.pOp !== pOp) { this.panel.style.opacity = String(pOp); this.panel.style.visibility = 'visible'; c.pOp = pOp; }

    /* 时间触发的三件事:开麦慢于 600ms 才写字;整理 1.2s 还没回来出亮点;收尾 400ms 后拿掉原话那一层 */
    var dt = t - this.tState, animate = this._animating(t);
    if (this.state === 'starting' && !this.openOn) {
      if (dt >= PROC.openingSlow) { this.openOn = true; L.open.aim(1, t, 'state', animate); this._relayout(animate); }
      else busy = true;
    }
    if (this.state === 'processing' && !this.dotOn && !isReduced()) {
      if (dt >= PROC.dotDelay) { this.dotOn = true; L.dot.aim(1, t, 'state', animate); }
      else busy = true;
    }
    if (this.rawHeld && (this.state === 'done' || this.state === 'cancel' || this.state === 'error')) {
      if (dt >= PROC.heldRawRelease) { this.rawHeld = false; this._relayout(animate); }
      else busy = true;
    }

    for (k in L) if (L[k].busy(t)) busy = true;
    var v = {};
    for (k in L) v[k] = L[k].value(t);

    /* 面板高度 = 文字区 + 按钮行;圆角 21 → 18 跟着文字区一起变 */
    var aH = Math.max(0, this.areaH.value(t));
    if (!this.areaH.done) busy = true;
    var H = aH + G.rowH * u;
    if (c.H !== H) {
      c.H = H;
      this.panel.style.height = H + 'px';
      var r = (G.radiusRow - (G.radiusRow - G.radiusText) * clamp01(aH / ((G.textTop + G.textBottom + G.capOneLine) * u))) * u;
      this.panel.style.borderRadius = r + 'px';
      if (this.state !== 'done' && this.state !== 'cancel' && this.state !== 'error') {
        this.rawBox.style.height = Math.max(0, aH - (G.textTop + G.textBottom) * u) + 'px';
      }
    }
    if (c.heldH !== this.heldRawH && (this.state === 'done' || this.state === 'cancel' || this.state === 'error')) {
      c.heldH = this.heldRawH;
      this.rawBox.style.height = (this.heldRawH || 0) + 'px';
      c.H = -1;
    }

    /* 文字区 */
    setOp(this.text, v.area, c, 'area');
    setOp(this.rawBox, v.raw, c, 'raw');
    setOp(this.res, v.result, c, 'res');

    /* 按钮行的件 */
    var ctl = v.controls;
    setOp(this.xEl, ctl, c, 'x');
    setOp(this.modeEl, this.mode === 'dictation' ? 0 : ctl * v.voice, c, 'mode');
    setOp(this.clockEl, ctl * v.voice, c, 'clock');
    setOp(this.checkEl, ctl * v.voice, c, 'check');
    setOp(this.openEl, v.open * (1 - v.voice), c, 'open');
    setOp(this.slotEl, v.done, c, 'slot');

    /* 计时数字滚动 */
    if (ctl * v.voice > 0.001) {
      var dy = 10 * u;
      for (var i = 0; i < this.cells.length; i++) {
        var cell = this.cells[i], p = cell.tw.value(t);
        if (cell.tw.busy(t)) busy = true;
        if (p === cell.last) continue;
        cell.last = p;
        var q = clamp01(p);
        cell.a.style.opacity = String(1 - q);
        cell.a.style.transform = q ? 'translateY(' + (-p * dy) + 'px)' : '';
        cell.b.style.opacity = String(q);
        cell.b.style.transform = p === 1 ? '' : 'translateY(' + ((1 - p) * dy) + 'px)';
      }
    }

    /* 线:听写中液带要动、亮点在走时才每帧醒 */
    if (this.state === 'listening' && !isReduced()) busy = true;
    if (this.state === 'processing' && this.dotOn && !isReduced()) busy = true;
    this._drawLine(t, v);
    return busy;
  };

  /* 中间那根线:开麦细线 → 液带 → 收成平线 → (亮点)→ 收尾平线 / 淡 danger 线(HUDVoiceLine)*/
  Capsule.prototype._drawLine = function (t, v) {
    var u = this.u, W = this.W, bx = 20 * u, by = 14 * u, Hc = G.lineH * u;
    var cv = this.canvas, dpr = global.devicePixelRatio || 1;
    var cssW = W + 2 * bx, cssH = Hc + 2 * by;
    var bw = Math.max(1, Math.round(cssW * dpr)), bh = Math.max(1, Math.round(cssH * dpr));
    if (cv.width !== bw || cv.height !== bh) {
      cv.width = bw; cv.height = bh;
      cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
      cv.style.left = (-bx) + 'px'; cv.style.top = (G.btnTop * u - by) + 'px';
    }
    var g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, bw, bh);                                     // 擦整块
    var sx = bw / cssW, sy = bh / cssH;
    var col = this._color(), mid = Hc / 2;

    /* ① 开麦那一行:✕ 后面一根 ink .25、1.2pt 的胶囊细线 */
    var sA = 1 - v.voice;
    if (sA > 0.002) {
      var pad = G.rowInset * u, gapX = G.gap * u;
      var a0 = pad + G.btn * u + gapX, a1 = W - pad - (this.openOn ? this.openEl.offsetWidth + gapX : 0);
      var lw0 = 1.2 * u;
      g.setTransform(sx, 0, 0, sy, bx * sx, by * sy);
      g.globalAlpha = sA * 0.25;
      g.fillStyle = col.ink;
      roundRect(g, a0, mid - lw0 / 2, Math.max(0, a1 - a0), lw0);
      g.globalAlpha = 1;
    }

    /* ② 听写那一行的线 */
    var vA = v.voice * v.lineOn;
    var Wl = v.lineW;
    if (vA <= 0.002 || Wl < 2) return;
    g.setTransform(sx, 0, 0, sy, (bx + v.lineX) * sx, by * sy);
    var target = this.state === 'listening' && this.shown ? this.level : 0;
    var amp, phase;
    if (this.state === 'listening' || this.state === 'starting') {
      if (isReduced()) { amp = target; phase = 1.7 * 5.5; }            // 静态终态(App 出图钉的相位)
      else {
        var dts = this._waveT ? Math.min(0.1, Math.max(0, (t - this._waveT) / 1000)) : 1 / 60;
        this.amp += (target - this.amp) * (1 - Math.exp(-dts / 0.067));   // = Mac 60Hz 下每帧 0.22(LevelSmoother)
        if (this.amp < 0.002) this.amp = 0;
        amp = this.amp;
        phase = (t / 1000) * 5.5;
        this.phase = phase;                                          // 记下:松手后按这个形状往中线收
      }
      this._waveT = t;
    } else {
      amp = this.amp; phase = this.phase; this._waveT = 0;
    }
    var step = 3 * u, capR = G.endCap * u, band = clamp01(v.band), dark = col.dark;

    /* 液带本体(HUDBandLayer):填充 / 描边 / 珊瑚光晕都按厚度一起淡 */
    if (band > 0.002) {
      var path = bandPath(Wl, Hc, amp, phase, band, step, capR);
      var glow = amp > 0.12 ? amp - 0.12 : 0;
      if (glow > 0 && !dark) glowFill(g, path, col.coral, glow * 0.62 * band * band, 8 * u, sx, sy, bw, false);
      g.globalAlpha = vA * (0.16 + amp * 0.2) * band;
      g.fillStyle = col.ink;
      g.fill(path);
      if (glow > 0 && dark) glowFill(g, path, col.coral, glow * 0.34 * band * band, 7 * u, sx, sy, bw, true);
      g.globalAlpha = vA * (0.32 + amp * 0.42) * band;
      g.strokeStyle = col.ink;
      g.lineWidth = 1.1 * u;
      g.stroke(path);
    }
    /* 中线(HUDCenterLayer):墨 .55、1.1pt 落成收尾平线 墨 .30、1.2pt;听写中不画 */
    var cA = vA * (1 - band) * (1 - v.danger);
    if (band < 1 && cA > 0.002) {
      var m = clamp01(v.flat), lw = (1.1 + (1.2 - 1.1) * m) * u;
      g.globalAlpha = cA * (0.55 + (0.30 - 0.55) * m);
      g.strokeStyle = col.ink;
      g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
      g.stroke(centerPath(Wl, Hc, amp, phase, m, lw, step, capR));
    }
    /* 失败那一档:淡 danger 平线(danger × .55) */
    if (v.danger > 0.002) {
      var lwd = 1.2 * u;
      g.globalAlpha = vA * v.danger * 0.55;
      g.strokeStyle = col.danger;
      g.lineWidth = lwd; g.lineCap = 'round';
      g.beginPath(); g.moveTo(lwd / 2, mid); g.lineTo(Wl - lwd / 2, mid); g.stroke();
    }
    /* 慢亮点(HUDDotLayer):2.5pt 中性灰,0.5 − 0.5·cos 一个来回 2.4s,结果到就地停住淡掉 */
    if (v.dot > 0.002) {
      if (this.state === 'processing' && !isReduced()) {
        var s = Math.max(0, t - this.tState - PROC.dotDelay);
        this.dotK = 0.5 - 0.5 * Math.cos(2 * Math.PI * s / PROC.dotPeriod);
      }
      var d = G.dot * u, inset = d / 2 + 1 * u;
      var x = inset + clamp01(this.dotK) * Math.max(0, Wl - 2 * inset);
      g.globalAlpha = vA * v.dot;
      g.fillStyle = col.dotc;
      g.beginPath(); g.arc(x, mid, d / 2, 0, 2 * Math.PI); g.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  };

  function roundRect(g, x, y, w, h) {
    var r = h / 2;
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y);
    g.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
    g.lineTo(x + r, y + h);
    g.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5);
    g.closePath(); g.fill();
  }
  /* blur(radius):用阴影画(各家浏览器都支持);本体画到画布外,只让阴影落回原处。
     SwiftUI 的 blur radius ≈ 高斯 σ,canvas 的 shadowBlur = 2σ。深色走 plusLighter(= canvas 'lighter') */
  function glowFill(g, path, color, alpha, radius, sx, sy, bw, lighter) {
    if (alpha <= 0.002) return;
    var off = bw + 64;
    g.save();
    if (lighter) g.globalCompositeOperation = 'lighter';
    g.globalAlpha = alpha;
    g.shadowColor = color;
    g.shadowBlur = 2 * radius * sy;
    g.shadowOffsetX = off;
    g.translate(-off / sx, 0);
    g.fillStyle = '#000';
    g.fill(path);
    g.restore();
  }

  Capsule.prototype.destroy = function () {
    if (this._io) this._io.disconnect();
    if (this._ro) this._ro.disconnect();
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
    GEOMETRY: G,
    PROC: PROC,
    math: { offset: offset, liquidPath: liquidPath, endCap: endCap, bandPath: bandPath, centerPath: centerPath },
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
