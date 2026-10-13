/* ══════════════════════════════════════════════════════════════════════════
   vibe.js:首页「对着 AI 说话」一节(#vibe)的演示动画。SITE-VIBE 原型,2026-10-13。
   ──────────────────────────────────────────────────────────────────────────
   和首页其它演示同一条纪律:画面是「时间的纯函数」。每帧只按 (本节已播放的毫秒数)
   算出该显示什么,没有状态机可以跑飞。
     · 进入视口才播,离开视口 / 切到别的标签页就暂停,回来接着播。
     · prefers-reduced-motion: reduce → 什么都不做,标记里的默认样式就是最终一帧。
     · 零 innerHTML:字幕一律 textContent / createElement。
     · 零网络:首页 CSP 是 connect-src 'none'。
     · 外部文件,满足首页 CSP 的 script-src 'self'。
     · 录音条 = 共享组件 MurmurCapsule(capsule.js / capsule.css,和首屏同一份,必须先于本文件加载)。
       这里只当「导演」:按时间算出该是哪个状态,变了才调组件。组件没加载就不演,停在最终一帧。
   截帧用:地址里带 ?vibe-t=毫秒 时冻结在那一刻(只读这个参数,不影响正常访问)。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var root = document.querySelector("[data-vibe]");
  if (!root) return;

  var m = /[?&]vibe-t=(\d+)/.exec(location.search);
  var seekAt = m ? parseInt(m[1], 10) : -1;
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced && seekAt < 0) return;
  var MC = window.MurmurCapsule;
  if (!MC) return;                                       // 共享录音条没加载:不演,停在最终一帧

  var section = root.closest(".vb") || root;
  var rounds = [].slice.call(root.querySelectorAll(".vb-round"));
  if (!rounds.length) return;
  var win = root.querySelector(".vb-win");
  var title = root.querySelector(".vb-title");
  var mount = root.querySelector(".vb-hud .capsule-mount");
  var key = root.querySelector(".vb-key");
  var busyText = root.getAttribute("data-busy") || "";
  if (!mount) return;

  /* ── 一轮的时间表(毫秒)。两轮交替,总循环 = ROUND × 轮数 ──
     0     待命:空提示符,光标闪
     600   第一次按右 ⌘;640 录音条出现
     700   实时字幕一个词一个词冒出来(最后一个词是灰的,还没定),到 5400 说完
     5600  第二次按右 ⌘ → 录音条换成「提示词技能整理中 · Ns · ESC 取消」,停 1.3 s 让人读完
     6900  录音条收起(组件自己的 0.18 s 下沉淡出)
     7000  整理后的提示词逐行落下,每行间隔 180 ms,淡入上移
     8000  第一处对照标注;8600 第二处
     12400 整窗淡出;13000 下一轮 */
  var ROUND = 13000;
  var KEY1 = 600, HUD_ON = 640, LISTEN = 700, KEY2 = 5600, HUD_OFF = 6900;
  var LAND = 7000, STEP = 180, NOTE1 = LAND + 1000, NOTE2 = LAND + 1600, FADE = 12400;
  var KEY_DOWN_MS = 170;

  rounds.forEach(function (r) {
    r._words = (r.getAttribute("data-ex") || "").split("|").filter(Boolean);
    r._lines = [].slice.call(r.querySelectorAll(".vb-ln"));
    r._notes = [].slice.call(r.querySelectorAll(".vb-note"));
  });

  section.classList.add("vb-live");
  if (seekAt >= 0) section.classList.add("vb-freeze");

  /* 录音条:和首屏同一个组件、同样的尺寸规则(手机宽 mini,≤360 再缩到 0.75) */
  var cap = MC.mount(mount, {
    size: matchMedia("(max-width: 420px)").matches ? "mini" : "full",
    caption: "above",
    scale: matchMedia("(max-width: 360px)").matches ? 0.75 : undefined
  });

  /* 只在值变了时才碰 DOM / 调组件 */
  function setClass(el, cls, on) {
    if (!el) return;
    if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
  }
  var last = {};
  function set(k, v, fn) { if (last[k] !== v) { last[k] = v; fn(v); } }

  /* 假电平:和首屏同一套(每 85 ms 一个台阶 = Mac 的音频缓冲节拍,组件自己平滑) */
  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function levelAt(dt, per, nWords) {
    var b = Math.floor(dt / 85), tb = b * 85, w = Math.floor(tb / per);
    if (w >= nWords) return 0;
    var p = (tb % per) / per;
    var base = p < 0.82 ? 0.35 + 0.35 * Math.sin(Math.PI * p / 0.82) : 0.15;
    return Math.max(0, Math.min(1, base + (hash(b) - 0.5) * 0.16));
  }

  function render(T) {
    var cycle = ROUND * rounds.length;
    var tt = ((T % cycle) + cycle) % cycle;
    var idx = Math.floor(tt / ROUND), t = tt - idx * ROUND;
    var r = rounds[idx];

    rounds.forEach(function (x, i) {
      setClass(x, "is-on", i === idx);
      if (i !== idx) {                                  // 藏起来的那一轮先复位,轮到它时从空提示符开始
        setClass(x, "fade", false); setClass(x, "landed", false);
        x._lines.forEach(function (el) { setClass(el, "on", false); });
        x._notes.forEach(function (el) { setClass(el, "on", false); });
      }
    });
    var tool = r.getAttribute("data-tool") || "";
    set("title", tool, function (v) { if (title) title.textContent = v; });
    setClass(win, "is-chat", r.getAttribute("data-kind") === "chat");

    var fading = t >= FADE;
    setClass(r, "fade", fading);
    setClass(title, "fade", fading);

    // 落字:逐行淡入上移
    setClass(r, "landed", t >= LAND);
    r._lines.forEach(function (ln, i) { setClass(ln, "on", t >= LAND + i * STEP); });
    r._notes.forEach(function (nt, i) { setClass(nt, "on", t >= (i === 0 ? NOTE1 : NOTE2)); });

    // 键帽:两次轻按
    setClass(key, "down", (t >= KEY1 && t < KEY1 + KEY_DOWN_MS) || (t >= KEY2 && t < KEY2 + KEY_DOWN_MS));

    // 录音条(共享组件)
    var words = r._words, per = (KEY2 - 200 - LISTEN) / words.length;
    var state = t < HUD_ON ? "hidden" : t < KEY2 ? "listening" : t < HUD_OFF ? "processing" : "hidden";
    set("state", idx + state, function () {
      if (state === "listening") {
        cap.setClock(0); cap.setCaption("", "");
        cap.setState("listening", { level: 0 });
      } else if (state === "processing") {
        cap.setCaption(words.join(""), "");             // 字幕卡原样留着最后那句话(和 App 一样)
        cap.setState("processing", { seconds: 0, label: busyText });
      } else {
        cap.setState("hidden");
      }
    });
    if (state === "listening" && t >= LISTEN) {
      var dt = t - LISTEN;
      set("level", Math.floor(dt / 85), function () { cap.setLevel(levelAt(dt, per, words.length)); });
      set("clock", Math.floor(dt / 1000), function (s) { cap.setClock(s); });
      var n = Math.min(words.length, Math.floor(dt / per) + 1);
      set("words", idx + "/" + n, function () { cap.setCaption(words.slice(0, n - 1).join(""), words[n - 1]); });
    } else {
      last.level = last.clock = last.words = undefined;
    }
    if (state === "processing") set("proc", Math.floor((t - KEY2) / 500) * 0.5, function (s) { cap.setProcessingSeconds(s); });
    else last.proc = undefined;
  }

  /* ── 截帧:冻结在指定时刻(组件的出现 / 字幕卡自己补间约 0.2 s,截图前等一下即可) ── */
  if (seekAt >= 0) {
    var once = function () { render(seekAt); };
    if (document.readyState === "complete") once(); else window.addEventListener("load", once);
    return;
  }

  /* ── 播放:只累加「看得见」的时间 ── */
  var elapsed = 0, lastNow = 0, visible = false, raf = 0;
  function playing() { return visible && !document.hidden; }
  function frame(now) {
    raf = 0;
    if (!playing()) { lastNow = 0; return; }
    if (lastNow) elapsed += Math.min(now - lastNow, 100);   // 卡顿或后台回来,单帧最多推进 100 ms
    lastNow = now;
    render(elapsed);
    raf = requestAnimationFrame(frame);
  }
  function kick() { if (playing() && !raf) { lastNow = 0; raf = requestAnimationFrame(frame); } }

  render(0);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      kick();
    }, { threshold: 0.25 }).observe(root);
  } else {
    visible = true; kick();
  }
  document.addEventListener("visibilitychange", kick);
})();
