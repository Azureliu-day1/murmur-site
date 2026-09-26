/* ══════════════════════════════════════════════════════════════════════════
   demo-ui.js · /demo/ 与 /en/demo/ 的页面逻辑(2026-09-26 · 0.53 起)
   ══════════════════════════════════════════════════════════════════════════
   只通过两个全局工作(契约 B):window.MURMUR_DEMO_WORDS(demo-words.js)、
   window.MurmurDemoEngine(demo.js)。这份文件只管:键盘 → engine.press、
   state → 画输入框与候选窗、自动演示的节拍。

   三条纪律:
   ① ⛔ 不用 HTML 字符串拼节点:候选、拼音、上屏的字一律 textContent / createElement。
   ② ⛔ 零网络:CSP 是 connect-src 'none'。
   ③ 自动演示的节拍和引擎的真实时钟相容:引擎的退回窗口(undoUntil)用
      Date.now(),这里的节拍全部是真实的 setTimeout 链,{wait:N} 按 N 停。

   文案按 <html lang> 切中英(同 v2-nav.js 的做法),两页共用这一份。

   给领导者截图用的 URL 参数(⛔ 不出现在任何页面文案里):
     ?auto=1             载入后自动开跑全部句子
     ?auto=1&stopAt=3    跑完第 3 句就停住,画面留在第 3 句
     …&stopKey=5         和 stopAt 一起用:第 stopAt 句只按前 5 个键就停住
                         (用来截「候选窗开着」的那一刻)
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var T = {
    zh: {
      ph: "点这里,敲 nihao 试试",
      phTouch: "点下面的「自动演示」",
      hint: "敲拼音,1–5 选字,空格上屏,退格 1.5 秒内退回",
      hintTouch: "手机上点「自动演示」看",
      cap: function (n, c) { return "第 " + n + " 句 · " + c; },
      done: function (n) { return n + " 句演示完了。点输入框,自己敲一句试试。"; },
      doneTouch: function (n) { return n + " 句演示完了。"; },
      lab: "接写",
      tail: "空格接1 · Esc收起",
      modeZh: "中文",
      modeEn: "英文",
      missing: "演示没有加载出来,刷新页面再试。",
    },
    en: {
      ph: "Click here and type nihao",
      phTouch: "Tap “Play demo” below",
      hint: "Type Pinyin. 1–5 picks, Space commits, Delete within 1.5 s puts it back.",
      hintTouch: "On a phone, tap “Play demo” to watch.",
      cap: function (n, c) { return "Line " + n + " · " + c; },
      done: function (n) { return "All " + n + " lines done. Click the text field and type your own."; },
      doneTouch: function (n) { return "All " + n + " lines done."; },
      lab: "Next",
      tail: "Space takes 1 · Esc closes",
      modeZh: "Chinese",
      modeEn: "English",
      missing: "The demo did not load. Refresh the page and try again.",
    },
  };
  var EN = /^en/i.test(document.documentElement.lang || "");
  var L = EN ? T.en : T.zh;

  var $ = function (id) { return document.getElementById(id); };
  var box = $("box"), elPh = $("ph"), elOut = $("out"), elComp = $("comp"), elCaret = $("caret");
  var slot = $("slot"), panel = $("panel"), cap = $("cap"), elMode = $("mode");
  var btnAuto = $("auto"), btnStop = $("stop"), btnReset = $("reset"), lines = $("lines");

  var mqNarrow = window.matchMedia ? window.matchMedia("(max-width: 820px)") : null;
  var mqCalm = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function narrow() { return !!(mqNarrow && mqNarrow.matches); }
  // 减弱动效时字母间隔改 40 ms,但仍逐键:演示的是按键过程,这是内容不是装饰
  function gap() { return mqCalm && mqCalm.matches ? 40 : 90; }

  var WORDS = window.MURMUR_DEMO_WORDS;
  if (typeof window.MurmurDemoEngine !== "function" || !WORDS) {
    cap.textContent = L.missing;
    cap.className = "state err";
    btnAuto.disabled = true; btnReset.disabled = true;
    return;
  }
  var engine = window.MurmurDemoEngine(WORDS, { now: function () { return Date.now(); } });
  var SENTENCES = Array.isArray(WORDS.sentences) ? WORDS.sentences : [];

  // ── 画 ────────────────────────────────────────────────────────────────
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;   // ⛔ 只用 textContent
    return n;
  }
  function numbered(cls, i, text, on) {
    var s = el("span", cls + (on ? " on" : ""));
    s.appendChild(el("i", null, String(i + 1)));
    s.appendChild(document.createTextNode(text));
    return s;
  }
  // 部分选词后已落下但还没上屏的字:契约 B 的 state() 没有这个字段。
  // 引擎将来若补上(pending / pendingText),这里直接接得上;没有就是空串。
  function pendingOf(st) { return String(st.pending || st.pendingText || ""); }

  function render(st) {
    var pending = pendingOf(st);
    var empty = !st.committed && !st.buffer && !pending;
    elPh.textContent = empty ? (narrow() ? L.phTouch : L.ph) : "";
    elOut.textContent = st.committed || "";
    elComp.textContent = pending + (st.buffer || "");
    elMode.textContent = st.mode === "en" ? L.modeEn : L.modeZh;

    panel.textContent = "";
    var cands = st.candidates || [], preds = st.predictions || [];
    if (cands.length) {
      var py = (st.segments && st.segments.length) ? st.segments.join(" ") : (st.buffer || "");
      panel.appendChild(el("span", "py-pinyin", pending ? pending + " " + py : py));
      var row = el("span", "py-cands");
      cands.slice(0, 5).forEach(function (c, i) { row.appendChild(numbered("py-cand", i, c.text, i === 0)); });
      panel.appendChild(row);
      panel.appendChild(el("span", "py-page", "‹ " + ((st.page || 0) + 1) + " ›"));
      panel.hidden = false;
    } else if (preds.length) {
      var nx = el("div", "py-next");
      nx.appendChild(el("span", "py-lab", L.lab));
      preds.slice(0, 5).forEach(function (w, i) { nx.appendChild(numbered("py-nx", i, w, i === 0)); });
      nx.appendChild(el("span", "py-tail", L.tail));
      panel.appendChild(nx);
      panel.hidden = false;
    } else {
      panel.hidden = true;
    }
    place();
  }

  // 候选窗大致跟着光标的 x:以组合中的拼音(没有就用光标)为锚,夹在舞台宽度以内。
  // 窄屏上 demo.css 用 !important 把它钉在左边,这里算的值不生效。
  function place() {
    if (panel.hidden) return;
    var anchor = elComp.textContent ? elComp : elCaret;
    var x = anchor.getBoundingClientRect().left - slot.getBoundingClientRect().left - 16;
    var max = slot.clientWidth - panel.offsetWidth;
    panel.style.left = Math.max(0, Math.min(x, max)) + "px";
  }

  engine.onChange(render);

  // ── 状态行 ────────────────────────────────────────────────────────────
  var holding = false;          // 状态行正显示「第 n 句」或「演示完了」,别被提示盖掉
  function hint() {
    holding = false;
    cap.className = "state";
    cap.textContent = narrow() ? L.hintTouch : L.hint;
  }
  function say(text) { holding = true; cap.className = "state"; cap.textContent = text; }

  // ── 自动演示 ──────────────────────────────────────────────────────────
  var TOKEN_KEYS = { "{space}": "Space", "{bs}": "Backspace", "{shift}": "Shift", "{enter}": "Enter", "{esc}": "Escape" };
  var run = null;               // { list, li, tokens, ti, pressed, timer, stopAt, stopKey }

  function caption(sen) { return (EN ? sen.en : sen.zh) || sen.zh || sen.en || ""; }
  function tokenize(script) { return String(script || "").split(/\s+/).filter(Boolean); }
  function later(fn, ms) { if (run) run.timer = setTimeout(fn, ms); }
  function markChip(idx) {
    Array.prototype.forEach.call(lines.children, function (c, i) { c.classList.toggle("on", i === idx); });
  }
  function setRunning(on) {
    btnStop.disabled = !on;
  }

  function stopAuto() {
    if (run && run.timer) clearTimeout(run.timer);
    run = null;
    setRunning(false);
  }

  function startAuto(list, opt) {
    stopAuto();
    if (!list.length) return;
    opt = opt || {};
    run = { list: list, li: 0, tokens: [], ti: 0, pressed: 0, timer: 0,
            stopAt: opt.stopAt || 0, stopKey: opt.stopKey || 0, whole: list.length > 1 };
    setRunning(true);
    nextSentence();
  }

  function nextSentence() {
    if (!run) return;
    if (run.li >= run.list.length) {
      var whole = run.whole;
      stopAuto();
      markChip(-1);
      if (whole) say((narrow() ? L.doneTouch : L.done)(SENTENCES.length));
      return;
    }
    var idx = run.list[run.li];
    engine.reset();
    markChip(idx);
    say(L.cap(idx + 1, caption(SENTENCES[idx])));
    run.tokens = tokenize(SENTENCES[idx].script);
    run.ti = 0; run.pressed = 0;
    later(step, 500);           // 先让人读一眼状态行,再开始敲
  }

  function step() {
    if (!run) return;
    var n = run.list[run.li] + 1;
    var here = run.stopAt && n === run.stopAt;
    if (here && run.stopKey && run.pressed >= run.stopKey) { stopAuto(); return; }   // 停在半路,画面保留
    if (run.ti >= run.tokens.length) {
      if (here) { stopAuto(); return; }                                               // 停在这一句的结尾
      run.li++;
      later(nextSentence, 1400);
      return;
    }
    var tok = run.tokens[run.ti++];
    var m = /^\{wait:(\d+)\}$/.exec(tok);
    if (m) { later(step, +m[1]); return; }
    var key = TOKEN_KEYS[tok] || (tok.length === 1 ? tok : null);
    if (key) { engine.press(key); run.pressed++; }
    later(step, gap());
  }

  // ── 键盘 ──────────────────────────────────────────────────────────────
  // Shift 只在「单按、中间没夹别的键」时算一次切换(产品 F9):keydown 记下,
  // keyup 时核对这期间有没有别的键。⌘ / ⌃ / ⌥ 组合一律放行,不拦。
  var shiftDown = false, shiftDirty = false;
  function mapKey(e) {
    switch (e.key) {
      case " ": case "Spacebar": return "Space";
      case "Backspace": return "Backspace";
      case "Enter": return "Enter";
      case "Escape": case "Esc": return "Escape";
    }
    return /^[a-zA-Z0-9,.\-=]$/.test(e.key) ? e.key : null;
  }
  box.addEventListener("keydown", function (e) {
    if (e.isComposing || e.key === "Process") return;          // 访客自己的系统输入法在组字
    if (e.metaKey || e.ctrlKey || e.altKey) { shiftDirty = true; return; }
    if (e.key === "Shift") {
      if (!e.repeat) { shiftDown = true; shiftDirty = false; }
      return;
    }
    if (shiftDown) shiftDirty = true;
    var k = mapKey(e);
    if (!k) return;                                            // Tab 等照常走
    e.preventDefault();                                        // 空格不滚页、退格不后退
    if (run) { stopAuto(); markChip(-1); }                     // 手一碰键盘,自动演示让位
    if (holding) hint();
    engine.press(k);
  });
  box.addEventListener("keyup", function (e) {
    if (e.key !== "Shift") return;
    var tap = shiftDown && !shiftDirty;
    shiftDown = false; shiftDirty = false;
    if (!tap) return;
    if (run) { stopAuto(); markChip(-1); }
    if (holding) hint();
    engine.press("Shift");
  });
  box.addEventListener("blur", function () { shiftDown = false; shiftDirty = false; });
  box.addEventListener("click", function () { box.focus(); });

  // ── 按钮 ──────────────────────────────────────────────────────────────
  SENTENCES.forEach(function (sen, i) {
    var b = el("button", "chip", caption(sen));
    b.type = "button";
    b.addEventListener("click", function () { startAuto([i]); });
    lines.appendChild(b);
  });
  function all() { return SENTENCES.map(function (_, i) { return i; }); }
  btnAuto.addEventListener("click", function () { startAuto(all()); });
  btnStop.addEventListener("click", function () { stopAuto(); markChip(-1); hint(); });
  btnReset.addEventListener("click", function () {
    stopAuto(); markChip(-1); engine.reset(); hint();
    if (!narrow()) box.focus();
  });

  function onNarrowChange() { if (!holding) hint(); render(engine.state()); }
  if (mqNarrow) {
    if (mqNarrow.addEventListener) mqNarrow.addEventListener("change", onNarrowChange);
    else if (mqNarrow.addListener) mqNarrow.addListener(onNarrowChange);
  }
  window.addEventListener("resize", place);

  // ── 开场 ──────────────────────────────────────────────────────────────
  setRunning(false);
  hint();
  render(engine.state());

  var q;
  try { q = new URLSearchParams(location.search); } catch (err) { q = null; }
  if (q && q.get("auto") === "1") {
    var stopAt = Math.max(0, Math.min(SENTENCES.length, parseInt(q.get("stopAt"), 10) || 0));
    var stopKey = Math.max(0, parseInt(q.get("stopKey"), 10) || 0);
    startAuto(stopAt ? all().slice(0, stopAt) : all(), { stopAt: stopAt, stopKey: stopKey });
  }
})();
