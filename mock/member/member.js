/* ── 样稿:/member/ 页的渲染(MEMBER-MOCK,上线前删)────────────────────────────
   数据只来自 fake.js 的 window.MemberMock,⛔ 不发请求。⛔ 零 innerHTML。
   上半(#top):方向 A = 状态卡(已登录)/ 三档对比(未登录);方向 B = 一行状态条。
   下半:两档卡片(按状态换按钮)+ 常见问题。 */
(function () {
  "use strict";
  var M = window.MemberMock;
  if (!M) return;
  var me = M.me, P = M.price, dir = M.dir;
  var LOGIN = "../../login/index.html";

  document.documentElement.dataset.dir = dir;
  document.documentElement.dataset.state = M.state;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function a(cls, text, href) { var n = el("a", cls, text); n.href = href; return n; }
  function parts(iso) { var p = iso.split("-"); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function dateLong(iso) { var p = parts(iso); return p.y + " 年 " + p.m + " 月 " + p.d + " 日"; }
  function dateShort(iso) { var p = parts(iso); return p.m + " 月 " + p.d + " 日"; }
  function num(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function meter(label, used, limit, unit, note) {
    var box = el("div", "m-meter");
    var top = el("div", "m-meter-top");
    top.appendChild(el("span", "k", label));
    top.appendChild(el("span", "v mono", num(used) + " / " + num(limit) + " " + unit));
    var bar = el("div", "m-bar"), fill = el("i");
    fill.style.width = Math.min(100, Math.round(used / limit * 100)) + "%";
    bar.appendChild(fill);
    box.appendChild(top); box.appendChild(bar);
    if (note) box.appendChild(el("p", "m-note", note));
    return box;
  }
  function kv(k, v, extra) {
    var r = el("div", "m-kv");
    r.appendChild(el("span", "k", k));
    var vv = el("span", "v", v);
    if (extra) vv.appendChild(el("span", "tbd", extra));
    r.appendChild(vv);
    return r;
  }

  // ── 标题 ──
  var title = document.getElementById("title"), lede = document.getElementById("lede");
  if (dir === "a" && me && me.plan === "free") {
    title.textContent = "你现在用的是免费档";
    lede.textContent = "说得多了,开通一档就不用数字数。";
  } else if (dir === "a" && me && me.plan === "pro") {
    title.textContent = "你是 Pro 会员";
    lede.textContent = "到期自动续费。想换档或取消,在这一页就能做。";
  }

  // ── 上半 ──
  var top = document.getElementById("top");

  function compare() {
    var t = el("div", "m-compare");
    var rows = [
      ["", "免费", "Pro", "Max"],
      ["价格", "免费", P.pro.month + " / 月", P.max.month + " / 月"],
      ["云端听写", "每周 2000 字", "不限字数", "不限字数"],
      ["长录音", "试一次,最长 3 分钟", "每月 20 小时", "每月 60 小时"],
      ["离线识别", "不限量", "不限量", "不限量"],
    ];
    rows.forEach(function (r, i) {
      var tr = el("div", "m-crow" + (i === 0 ? " head" : ""));
      r.forEach(function (c, j) {
        var cell = el("div", "m-cell" + (j === 0 ? " k" : "") + (j >= 2 ? " paid" : ""), c);
        if (i === 1 && j >= 2) cell.appendChild(el("span", "tbd", "待定"));
        tr.appendChild(cell);
      });
      t.appendChild(tr);
    });
    var foot = el("div", "m-compare-foot");
    foot.appendChild(a("btn btn-primary", "登录后开通", LOGIN));
    var p = el("p", "m-note");
    p.appendChild(document.createTextNode("还没有账号?"));
    p.appendChild(a("", "申请一个", LOGIN + "#apply"));
    foot.appendChild(p);
    t.appendChild(foot);
    return t;
  }

  function cardFree() {
    var c = el("div", "m-status");
    var l = el("div", "m-status-main");
    var h = el("div", "m-status-head");
    h.appendChild(el("span", "mm-tag", "免费"));
    l.appendChild(h);
    l.appendChild(el("p", "m-status-big", "本周还能听写 " + num(me.dictation.limit - me.dictation.used) + " 字"));
    l.appendChild(el("p", "m-status-mail mono", me.email));
    var acts = el("div", "m-acts");
    acts.appendChild(a("btn btn-primary", "开通 Pro", "#"));
    acts.appendChild(a("btn btn-quiet", "开通 Max", "#"));
    l.appendChild(acts);
    var r = el("div", "m-status-side");
    r.appendChild(meter("本周听写", me.dictation.used, me.dictation.limit, "字", "每周重置。开通后不限字数。"));
    r.appendChild(kv("长录音试用", me.lecture.used ? "已用过" : "还没用"));
    r.appendChild(el("p", "m-note", "免费试一次,最长 3 分钟。"));
    r.appendChild(kv("离线识别", "不限量"));
    c.appendChild(l); c.appendChild(r);
    return c;
  }

  function cardPro() {
    var c = el("div", "m-status on");
    var l = el("div", "m-status-main");
    var h = el("div", "m-status-head");
    h.appendChild(el("span", "mm-tag on", "Pro"));
    h.appendChild(el("span", "mm-cycle", me.interval === "year" ? "年付" : "月付"));
    l.appendChild(h);
    l.appendChild(el("p", "m-status-big", "到 " + dateLong(me.period_end)));
    l.appendChild(el("p", "m-status-mail mono", me.email));
    var acts = el("div", "m-acts");
    acts.appendChild(a("btn btn-quiet", "管理订阅", M.portalUrl));
    acts.appendChild(a("btn btn-primary", "升级到 Max", "#plansWrap"));
    l.appendChild(acts);
    l.appendChild(el("p", "m-note", "管理订阅会打开 Stripe 账户页:换卡、看账单、取消。"));
    var r = el("div", "m-status-side");
    r.appendChild(kv("下次扣费", dateLong(me.next_charge.date) + " · " + me.next_charge.amount, "待定"));
    r.appendChild(kv("云端听写", "不限字数"));
    r.appendChild(meter("本期长录音", me.lecture.used, me.lecture.limit, "小时", dateShort(me.period_end) + "重置。"));
    r.appendChild(kv("离线识别", "不限量"));
    c.appendChild(l); c.appendChild(r);
    return c;
  }

  function strip() {
    var s = el("div", "m-strip" + (me && me.plan === "pro" ? " on" : ""));
    if (!me) {
      s.classList.add("out");
      s.appendChild(el("span", "", "登录后,方案和到期日会显示在顶栏右上角。"));
      s.appendChild(a("m-strip-go", "登录", LOGIN));
      return s;
    }
    if (me.plan === "pro") {
      s.appendChild(el("span", "mm-tag on", "Pro"));
      s.appendChild(el("span", "m-strip-item strong", "到 " + dateLong(me.period_end)));
      s.appendChild(el("span", "m-strip-item", "下次扣费 " + me.next_charge.amount));
      s.appendChild(el("span", "m-strip-item mono", "长录音 " + me.lecture.used + " / " + me.lecture.limit + " 小时"));
      s.appendChild(a("m-strip-go", "管理订阅", M.portalUrl));
    } else {
      s.appendChild(el("span", "mm-tag", "免费"));
      s.appendChild(el("span", "m-strip-item strong mono", "本周听写 " + num(me.dictation.used) + " / " + num(me.dictation.limit) + " 字"));
      s.appendChild(el("span", "m-strip-item", "长录音试用 " + (me.lecture.used ? "已用过" : "还没用")));
      s.appendChild(a("m-strip-go", "开通会员", "#plansWrap"));
    }
    return s;
  }

  if (dir === "a") top.appendChild(!me ? compare() : me.plan === "pro" ? cardPro() : cardFree());
  else top.appendChild(strip());

  // ── 下半:卡片 ──
  var cycle = "month";
  var plansTitle = document.getElementById("plansTitle");
  if (me && me.plan === "pro") plansTitle.textContent = "换一档";
  else if (me) plansTitle.textContent = "开通一档";

  function renderPlans() {
    ["pro", "max"].forEach(function (k) {
      var card = document.querySelector('.m-plan[data-plan="' + k + '"]');
      var pr = P[k];
      card.querySelector(".amount").textContent = cycle === "year" ? pr.year : pr.month;
      card.querySelector(".per").textContent = cycle === "year" ? "/ 年" : "/ 月";
      var full = parseFloat(pr.month.slice(1)) * 12, yr = parseFloat(pr.year.slice(1));
      var save = Math.round((1 - yr / full) * 100);
      card.querySelector(".alt").textContent = cycle === "year"
        ? "合 " + pr.yearPerMonth + " / 月,比月付少 " + save + "%"
        : "年付 " + pr.year + ",合 " + pr.yearPerMonth + " / 月";
      var btn = card.querySelector(".buy"), mine = card.querySelector(".m-mine");
      var name = k === "pro" ? "Pro" : "Max";
      btn.className = "btn btn-primary btn-block buy";
      btn.removeAttribute("aria-disabled");
      mine.hidden = true;
      card.classList.remove("is-mine");
      if (!me) { btn.textContent = "登录后开通"; btn.href = LOGIN; }
      else if (me.plan === k) {
        mine.hidden = false; card.classList.add("is-mine");
        btn.textContent = "当前方案"; btn.className = "btn btn-quiet btn-block buy";
        btn.setAttribute("aria-disabled", "true"); btn.removeAttribute("href");
      } else if (me.plan === "pro" && k === "max") { btn.textContent = "升级到 Max"; btn.href = "#"; }
      else { btn.textContent = "开通 " + name; btn.href = "#"; }
    });
  }
  var box = document.getElementById("cycle");
  var btns = box.querySelectorAll("button[data-cycle]");
  btns.forEach(function (b) {
    b.addEventListener("click", function () {
      cycle = b.dataset.cycle === "year" ? "year" : "month";
      btns.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      renderPlans();
    });
  });
  renderPlans();
  document.getElementById("paynote").textContent = !me
    ? "登录后开通,付款会记到你的账号。付款由 Stripe 处理。"
    : "你已登录,付款会记到这个账号。付款由 Stripe 处理。";

  // ── 样稿切换器(不是产品的一部分)──
  if (new URLSearchParams(location.search).get("shot") !== "1") {
    var sw = document.getElementById("mockSwitch");
    sw.appendChild(el("span", "lab", "样稿"));
    [["a", "A 专区页"], ["b", "B 状态条"]].forEach(function (d) {
      var g = el("div", "grp");
      g.appendChild(el("span", "lab", d[1]));
      [["out", "没登录"], ["free", "免费"], ["pro", "Pro"]].forEach(function (s) {
        var l = a("opt" + (d[0] === dir && s[0] === M.state ? " cur" : ""), s[1], "?dir=" + d[0] + "&state=" + s[0]);
        g.appendChild(l);
      });
      sw.appendChild(g);
    });
    sw.hidden = false;
  }
})();
