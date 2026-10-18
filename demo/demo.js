/* Murmur 拼音演示引擎(契约 B)。纯逻辑,零 DOM,零依赖。
 * 行为对着 docs/BASELINE-site-ime.md 事实核对表 F5–F11。 */
(function () {
  "use strict";
  // 函数声明会提升,挂全局放在顶部
  var root = typeof window !== "undefined" ? window : globalThis; root.MurmurDemoEngine = MurmurDemoEngine;


  var PAGE_SIZE = 5;          // F5
  var UNDO_WINDOW_MS = 1500;  // F7
  var MAX_PREDICTIONS = 5;    // F11
  var MAX_SYLLABLE_LEN = 6;   // zhuang / chuang / shuang

  var ZH_PUNCT = { ",": "，", ".": "。" };
  // F8:含标点或空格的上屏不给退回
  var NO_UNDO_TEXT = /[\s,.!?;:，。！？；：、]/;

  function MurmurDemoEngine(words, opts) {
    words = words || {};
    opts = opts || {};
    var now = typeof opts.now === "function" ? opts.now : function () { return Date.now(); };

    var syllableSet = {};
    (words.syllables || []).forEach(function (s) { syllableSet[s] = true; });
    var wordList = (words.words || []).map(function (w, i) {
      return { code: w[0], text: w[1], weight: +w[2] || 0, order: i };
    });
    // 整句拼词(compose)用:每个全拼只留权重最高的那个词
    var bestByCode = {};
    var maxCodeLen = 0;
    wordList.forEach(function (w) {
      if (!/^[a-z]+$/.test(w.code)) return;
      var b = bestByCode[w.code];
      if (!b || byWeight(w, b) < 0) bestByCode[w.code] = w;
      if (w.code.length > maxCodeLen) maxCodeLen = w.code.length;
    });
    var nextTable = words.next || {};
    var mixedTable = words.mixed || {};

    var listeners = [];
    var s; // 内部状态

    function fresh() {
      return {
        mode: "zh",
        buffer: "",
        segments: [],
        all: [],            // 全部候选 {text, code, consume}
        page: 0,
        committed: "",
        predictions: [],
        undoUntil: 0,
        lastAction: "",
        lastCommit: null,   // {text, code}
        pendingText: "",    // 部分选词已落下的字(规则 8)
        pendingCode: ""
      };
    }

    // 规则 1:最长合法音节前向切分;切不出的字母各自成段
    function segment(buf) {
      var out = [];
      var i = 0;
      while (i < buf.length) {
        var hit = 0;
        for (var len = Math.min(MAX_SYLLABLE_LEN, buf.length - i); len >= 1; len--) {
          if (syllableSet[buf.substr(i, len)]) { hit = len; break; }
        }
        if (!hit) hit = 1;
        out.push(buf.substr(i, hit));
        i += hit;
      }
      return out;
    }

    function byWeight(a, b) { return b.weight - a.weight || a.order - b.order; }

    // 规则 17:整句。把 buffer 用词表里的词从头拼起来(动态规划):词数最少优先,
    // 词数相同取权重和大的。整段拼得完 → 整句吃完整段;拼不完 → 取能拼的最长一段,
    // 剩下的拼音留在 buffer(选它之后照规则 8 继续)。
    // 只有一个词的「最长一段」不算整句(那就是规则 2 的「前几个音节」,别抢前缀词的位置)。
    function compose(buf) {
      var n = buf.length;
      var best = [{ count: 0, score: 0, prev: -1, word: null }];
      for (var i = 0; i < n; i++) {
        var from = best[i];
        if (!from) continue;
        for (var len = 1; len <= maxCodeLen && i + len <= n; len++) {
          var w = bestByCode[buf.substr(i, len)];
          if (!w) continue;
          var c = { count: from.count + 1, score: from.score + w.weight, prev: i, word: w };
          var cur = best[i + len];
          if (!cur || c.count < cur.count || (c.count === cur.count && c.score > cur.score)) best[i + len] = c;
        }
      }
      var end = n;
      while (end > 0 && !best[end]) end--;
      if (!end || (end < n && best[end].count < 2)) return null;
      var parts = [];
      for (var at = end; at > 0; at = best[at].prev) parts.unshift(best[at].word.text);
      return { text: parts.join(""), code: buf.slice(0, end), consume: end };
    }

    // 规则 2:mixed > 整句(规则 17)> 整段 > 前缀 > 只覆盖前几个音节(长的在前)
    function computeCandidates(buf, segs) {
      if (!buf) return [];
      var out = [];
      var seen = {};
      function add(text, code, consume) {
        if (seen[text]) return;
        seen[text] = true;
        out.push({ text: text, code: code, consume: consume });
      }
      if (Object.prototype.hasOwnProperty.call(mixedTable, buf)) add(mixedTable[buf], buf, buf.length);
      var sentence = compose(buf);
      if (sentence) add(sentence.text, sentence.code, sentence.consume);
      wordList.filter(function (w) { return w.code === buf; }).sort(byWeight)
        .forEach(function (w) { add(w.text, w.code, buf.length); });
      wordList.filter(function (w) { return w.code !== buf && w.code.indexOf(buf) === 0; }).sort(byWeight)
        .forEach(function (w) { add(w.text, w.code, buf.length); });
      for (var k = segs.length - 1; k >= 1; k--) {
        var head = segs.slice(0, k).join("");
        wordList.filter(function (w) { return w.code === head; }).sort(byWeight)
          .forEach(function (w) { add(w.text, w.code, head.length); });
      }
      return out;
    }

    function recompute() {
      s.segments = segment(s.buffer);
      s.all = computeCandidates(s.buffer, s.segments);
      s.page = 0;
    }

    function setBuffer(buf) {
      s.buffer = buf;
      if (!buf) { s.pendingText = ""; s.pendingCode = ""; }
      recompute();
    }

    function pages() { return Math.ceil(s.all.length / PAGE_SIZE); }
    function pageItems() { return s.all.slice(s.page * PAGE_SIZE, s.page * PAGE_SIZE + PAGE_SIZE); }

    function lookupNext(text) {
      var list = nextTable[text];
      return list ? list.slice(0, MAX_PREDICTIONS) : [];
    }

    function appendCommitted(str) { s.committed += str; }

    function deleteLastCommittedChar() {
      var c = s.committed;
      if (!c) return;
      var n = 1;
      var code = c.charCodeAt(c.length - 1);
      if (code >= 0xDC00 && code <= 0xDFFF && c.length >= 2) n = 2;
      s.committed = c.slice(0, c.length - n);
    }

    // 选一个候选;整段吃完 = 上屏完成(规则 9),否则剩余拼音留下(规则 8)
    // allowUndo=false 用于标点上屏(F8)
    function selectCandidate(cand, allowUndo) {
      var consumed = s.buffer.slice(0, cand.consume);
      var rest = s.buffer.slice(cand.consume);
      appendCommitted(cand.text);
      s.pendingText += cand.text;
      s.pendingCode += consumed;
      s.buffer = rest;
      s.predictions = [];
      if (rest) {
        recompute();
        s.undoUntil = 0;
        s.lastAction = "type";
        return false;
      }
      var fullText = s.pendingText;
      var fullCode = s.pendingCode;
      setBuffer("");
      if (allowUndo && !NO_UNDO_TEXT.test(fullText)) {
        s.undoUntil = now() + UNDO_WINDOW_MS;
        s.lastCommit = { text: fullText, code: fullCode };
      } else {
        s.undoUntil = 0;
        s.lastCommit = null;
      }
      var preds = lookupNext(fullText);
      if (!preds.length && fullText !== cand.text) preds = lookupNext(cand.text);
      s.predictions = preds;
      s.lastAction = "commit";
      return true;
    }

    // 原样落下 buffer(Enter / Shift / 无候选时),不给退回(F8)
    function flushRaw() {
      if (!s.buffer) return;
      appendCommitted(s.buffer);
      setBuffer("");
      s.undoUntil = 0;
      s.lastCommit = null;
    }

    // 标点:把组合整段用高亮候选吃完,吃不动的原样落下
    function flushWithHighlighted() {
      var guard = 64;
      while (s.buffer && guard-- > 0) {
        var items = pageItems();
        if (!items.length) { flushRaw(); break; }
        selectCandidate(items[0], false);
      }
      if (s.buffer) flushRaw();
    }

    function acceptPrediction(idx) {
      var word = s.predictions[idx];
      if (word === undefined) return false;
      appendCommitted(word);
      s.undoUntil = 0;          // F8:联想接的词不给退回
      s.lastCommit = null;
      s.predictions = lookupNext(word);
      s.lastAction = "predict";
      return true;
    }

    function composing() { return s.buffer.length > 0; }

    function handle(key) {
      var isLetter = /^[a-zA-Z]$/.test(key);
      var isDigit = /^[0-9]$/.test(key);
      var isPunct = key === "," || key === ".";
      var isPager = key === "-" || key === "=";

      if (key !== "Backspace") s.undoUntil = 0; // 任何别的键都关掉退回窗口

      // 规则 11:Shift 切中英,buffer 原样落下
      if (key === "Shift") {
        flushRaw();
        s.predictions = [];
        s.mode = s.mode === "zh" ? "en" : "zh";
        s.lastAction = "toggle";
        return;
      }

      // 规则 12:英文态直通
      if (s.mode === "en") {
        if (isLetter || isDigit || isPunct || isPager) { appendCommitted(key); s.lastAction = "type"; }
        else if (key === "Space") { appendCommitted(" "); s.lastAction = "type"; }
        else if (key === "Enter") { appendCommitted("\n"); s.lastAction = "type"; }
        else if (key === "Backspace") { deleteLastCommittedChar(); s.lastAction = "type"; }
        else if (key === "Escape") { s.lastAction = "clear"; }
        return;
      }

      // 以下为中文态
      if (isLetter) {
        s.predictions = []; // 规则 14:打字母收起联想
        setBuffer(s.buffer + key.toLowerCase());
        s.lastAction = "type";
        return;
      }

      if (isDigit) {
        var d = +key;
        if (composing()) {
          // 规则 3
          if (d >= 1 && d <= 5) {
            var cand = pageItems()[d - 1];
            if (cand) selectCandidate(cand, true);
          }
          return;
        }
        if (s.predictions.length && d >= 1 && d <= 5) {
          if (acceptPrediction(d - 1)) return;
          return;
        }
        s.predictions = [];
        appendCommitted(key);
        s.lastAction = "type";
        return;
      }

      if (key === "Space") {
        // 规则 4
        if (composing()) {
          var first = pageItems()[0];
          if (first) selectCandidate(first, true);
          else { flushRaw(); s.lastAction = "commit"; }
          return;
        }
        // App 方案 A(2026-09-26,murmur-ime CandidateStrip.swift 194–197):空格从不接联想。
        // 联想行在台上时空格 = 收起联想行 + 照常打出一个空格;接词只用数字 1–5。
        s.predictions = [];
        appendCommitted(" ");
        s.lastAction = "type";
        return;
      }

      if (isPager) {
        // 规则 5
        if (s.all.length) {
          var n = pages();
          if (key === "-") s.page = Math.max(0, s.page - 1);
          else s.page = Math.min(n - 1, s.page + 1);
          s.lastAction = "page";
          return;
        }
        s.predictions = [];
        appendCommitted(key);
        s.lastAction = "type";
        return;
      }

      if (isPunct) {
        // 规则 6:组合态 = 高亮候选 + 标点,不给退回
        var p = ZH_PUNCT[key];
        if (composing()) flushWithHighlighted();
        appendCommitted(p);
        s.undoUntil = 0;
        s.lastCommit = null;
        s.predictions = [];
        s.lastAction = "commit";
        return;
      }

      if (key === "Enter") {
        // 规则 7
        s.predictions = [];
        if (composing()) { flushRaw(); s.lastAction = "commit"; return; }
        appendCommitted("\n");
        s.lastAction = "type";
        return;
      }

      if (key === "Backspace") {
        // 规则 10
        var lc = s.lastCommit;
        if (!composing() && lc && s.undoUntil && now() <= s.undoUntil &&
            s.committed.length >= lc.text.length &&
            s.committed.slice(s.committed.length - lc.text.length) === lc.text) {
          s.committed = s.committed.slice(0, s.committed.length - lc.text.length);
          s.undoUntil = 0;
          s.lastCommit = null;
          s.predictions = [];
          setBuffer(lc.code);
          s.lastAction = "undo";
          return;
        }
        s.undoUntil = 0;
        s.lastCommit = null;
        if (composing()) {
          setBuffer(s.buffer.slice(0, -1));
          s.lastAction = "type";
          return;
        }
        s.predictions = [];
        deleteLastCommittedChar();
        s.lastAction = "type";
        return;
      }

      if (key === "Escape") {
        // 规则 13
        if (s.predictions.length) { s.predictions = []; s.lastAction = "clear"; return; }
        setBuffer("");
        s.lastAction = "clear";
        return;
      }
    }

    var KNOWN = /^([a-zA-Z0-9,.\-=]|Space|Backspace|Shift|Enter|Escape)$/;

    function snapshot() {
      return {
        mode: s.mode,
        buffer: s.buffer,
        segments: s.segments.slice(),
        candidates: pageItems().map(function (c) { return { text: c.text, code: c.code }; }),
        page: s.page,
        pages: pages(),
        committed: s.committed,
        predictions: s.predictions.slice(),
        undoUntil: s.undoUntil,
        lastAction: s.lastAction
      };
    }

    function emit() {
      for (var i = 0; i < listeners.length; i++) listeners[i](snapshot());
    }

    var TOKEN_KEYS = { "{space}": "Space", "{bs}": "Backspace", "{shift}": "Shift", "{enter}": "Enter", "{esc}": "Escape" };

    var api = {
      press: function (key) {
        if (typeof key !== "string" || !KNOWN.test(key)) return; // 未知 key 忽略
        handle(key);
        emit();
      },
      state: snapshot,
      reset: function () { s = fresh(); emit(); },
      onChange: function (fn) {
        if (typeof fn !== "function") return function () {};
        listeners.push(fn);
        return function () {
          var i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        };
      },
      runScript: function (script, stepFn) {
        var tokens = String(script || "").split(/\s+/).filter(Boolean);
        var count = 0;
        tokens.forEach(function (tok) {
          if (/^\{wait:\d+\}$/.test(tok)) return;
          var key = TOKEN_KEYS[tok] || (tok.length === 1 ? tok : null);
          if (!key || !KNOWN.test(key)) return;
          api.press(key);
          count++;
          if (typeof stepFn === "function") stepFn(tok, snapshot());
        });
        return count;
      }
    };

    s = fresh();
    return api;
  }

  if (typeof module !== "undefined") module.exports = MurmurDemoEngine;
})();
