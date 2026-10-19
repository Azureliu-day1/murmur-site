/* ══════════════════════════════════════════════════════════════════════════
   skills.js:提示词技能页(中英共用)的演示动画。SITE-SKILLS,2026-10-18。
   ──────────────────────────────────────────────────────────────────────────
   照首页 vibe.js 的写法:画面是「时间的纯函数」,每帧只按已播放的毫秒数算出该显示什么。
     · 进入视口才播,离开视口 / 切到别的标签页就暂停,回来接着播。
     · prefers-reduced-motion: reduce → 什么都不做,标记里的默认样式就是四段静态对照。
     · 零 innerHTML,零网络。外部文件,满足页面 CSP 的 script-src 'self'。
     · 录音条 = 共享组件 MurmurCapsule(capsule.js / capsule.css,必须先于本文件加载);
       这里只当「导演」:按时间算出该是哪个状态,变了才调组件。组件没加载就不演。
   比 vibe.js 多的三样:「做法」那一行先露后折叠(.sk-ap.on → .folded)、小标签晚一拍
   出现(.tagged)、场景按钮(高亮当前段,点一下跳过去)。
   截帧用:地址里带 ?sk-t=毫秒 时冻结在那一刻(只读这个参数,不影响正常访问)。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var root = document.querySelector("[data-skdemo]");
  if (!root) return;

  var m = /[?&]sk-t=(\d+)/.exec(location.search);
  var seekAt = m ? parseInt(m[1], 10) : -1;
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced && seekAt < 0) return;
  var MC = window.MurmurCapsule;
  if (!MC) return;

  var section = root.closest(".vb") || root;
  var rounds = [].slice.call(root.querySelectorAll(".vb-round"));
  if (!rounds.length) return;
  var win = root.querySelector(".vb-win");
  var title = root.querySelector(".vb-title");
  var mount = root.querySelector(".vb-hud .capsule-mount");
  var key = root.querySelector(".vb-key");
  var pills = [].slice.call(root.querySelectorAll(".sk-scenes button"));
  var busyText = root.getAttribute("data-busy") || "";   // 旧接口照传;App 整理中不写字,组件不画它
  if (!mount) return;

  /* ── 一段的时间表(毫秒)。四段轮流,总循环 = ROUND × 段数 ──
     0     待命:空提示符,光标闪
     500   第一次按右 ⌘;540 录音条出现
     600   实时字幕一个词一个词冒出来,到 4700 说完
     4900  第二次按右 ⌘ → 录音条进整理中(照 App 录音条 v2:一个字都不写,液带收成细平线),停 1.1 s
           (< 组件的亮点延迟 1.2 s,免得亮点刚冒头就收起)
     6000  录音条收起
     6200  整理后的需求逐行落下,每行间隔 180 ms
     落完 + 260   「做法」露出一行概括
     露出 + 500   小标签出现:已附上做法 · 某技能
     露出 + 2600  「做法」折叠成一行「做法 · 3 条」
     12000 整窗淡出;12600 下一段 */
  var ROUND = 12600;
  var KEY1 = 500, HUD_ON = 540, LISTEN = 600, KEY2 = 4900, HUD_OFF = 6000;
  var LAND = 6200, STEP = 180, AP_GAP = 260, TAG_AFTER = 500, FOLD_AFTER = 2600, FADE = 12000;
  var KEY_DOWN_MS = 170;

  rounds.forEach(function (r) {
    r._words = (r.getAttribute("data-ex") || "").split("|").filter(Boolean);
    r._lines = [].slice.call(r.querySelectorAll(".vb-ln:not(.sk-ap)"));
    r._ap = r.querySelector(".sk-ap");
    r._apAt = LAND + r._lines.length * STEP + AP_GAP;
  });

  section.classList.add("vb-live");
  if (seekAt >= 0) section.classList.add("vb-freeze");

  var cap = MC.mount(mount, {
    size: matchMedia("(max-width: 420px)").matches ? "mini" : "full",
    caption: "above",
    scale: matchMedia("(max-width: 360px)").matches ? 0.75 : undefined
  });

  function setClass(el, cls, on) {
    if (!el) return;
    if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
  }
  var last = {};
  function set(k, v, fn) { if (last[k] !== v) { last[k] = v; fn(v); } }

  /* 假电平:和首屏 / vibe 同一套(每 85 ms 一个台阶,组件自己平滑) */
  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function levelAt(dt, per, nWords) {
    var b = Math.floor(dt / 85), tb = b * 85, w = Math.floor(tb / per);
    if (w >= nWords) return 0;
    var p = (tb % per) / per;
    var base = p < 0.82 ? 0.35 + 0.35 * Math.sin(Math.PI * p / 0.82) : 0.15;
    return Math.max(0, Math.min(1, base + (hash(b) - 0.5) * 0.16));
  }

  function reset(x) {
    setClass(x, "fade", false); setClass(x, "landed", false); setClass(x, "tagged", false);
    x._lines.forEach(function (el) { setClass(el, "on", false); });
    if (x._ap) { setClass(x._ap, "on", false); setClass(x._ap, "folded", false); }
  }

  function render(T) {
    var cycle = ROUND * rounds.length;
    var tt = ((T % cycle) + cycle) % cycle;
    var idx = Math.floor(tt / ROUND), t = tt - idx * ROUND;
    var r = rounds[idx];

    rounds.forEach(function (x, i) {
      setClass(x, "is-on", i === idx);
      if (i !== idx) reset(x);
    });
    pills.forEach(function (p, i) {
      setClass(p, "on", i === idx);
      if (i === idx) p.setAttribute("aria-current", "step"); else p.removeAttribute("aria-current");
    });
    set("title", r.getAttribute("data-tool") || "", function (v) { if (title) title.textContent = v; });
    setClass(win, "is-chat", r.getAttribute("data-kind") === "chat");

    var fading = t >= FADE;
    setClass(r, "fade", fading);
    setClass(title, "fade", fading);

    setClass(r, "landed", t >= LAND);
    r._lines.forEach(function (ln, i) { setClass(ln, "on", t >= LAND + i * STEP); });
    if (r._ap) {
      setClass(r._ap, "on", t >= r._apAt);
      setClass(r._ap, "folded", t >= r._apAt + FOLD_AFTER);
    }
    setClass(r, "tagged", t >= r._apAt + TAG_AFTER);

    setClass(key, "down", (t >= KEY1 && t < KEY1 + KEY_DOWN_MS) || (t >= KEY2 && t < KEY2 + KEY_DOWN_MS));

    var words = r._words, per = (KEY2 - 200 - LISTEN) / Math.max(1, words.length);
    var state = t < HUD_ON ? "hidden" : t < KEY2 ? "listening" : t < HUD_OFF ? "processing" : "hidden";
    set("state", idx + state, function () {
      if (state === "listening") {
        cap.setClock(0); cap.setCaption("", "");
        cap.setState("listening", { level: 0 });
      } else if (state === "processing") {
        cap.setCaption(words.join(""), "");
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
      set("words", idx + "/" + n, function () { cap.setCaption(words.slice(0, n - 1).join(""), words[n - 1] || ""); });
    } else {
      last.level = last.clock = last.words = undefined;
    }
    if (state === "processing") set("proc", Math.floor((t - KEY2) / 500) * 0.5, function (s) { cap.setProcessingSeconds(s); });
    else last.proc = undefined;
  }

  if (seekAt >= 0) {
    var once = function () { render(seekAt); };
    if (document.readyState === "complete") once(); else window.addEventListener("load", once);
    return;
  }

  var elapsed = 0, lastNow = 0, visible = false, raf = 0;
  function playing() { return visible && !document.hidden; }
  function frame(now) {
    raf = 0;
    if (!playing()) { lastNow = 0; return; }
    if (lastNow) elapsed += Math.min(now - lastNow, 100);
    lastNow = now;
    render(elapsed);
    raf = requestAnimationFrame(frame);
  }
  function kick() { if (playing() && !raf) { lastNow = 0; raf = requestAnimationFrame(frame); } }

  /* 场景按钮:跳到那一段的开头 */
  pills.forEach(function (p, i) {
    p.addEventListener("click", function () {
      elapsed = i * ROUND;
      last = {};
      render(elapsed);
      kick();
    });
  });

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
