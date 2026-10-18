/* node demo/demo-selftest.js —— 契约 B 规则 1–17 逐条断言(零浏览器,用下面的小 FIXTURE),
 * 最后一段「真词表」载入 demo-words.js:验收句第一候选整句命中、10 个场景脚本演完的结果不变。 */
"use strict";
var path = require("path");
var Engine = require(path.join(__dirname, "demo.js"));

var FIXTURE = {
  syllables: ["a", "ai", "an", "ge", "hao", "jin", "ma", "ni", "qi", "tian", "yong", "zhe", "me", "de", "shi", "wo"],
  words: [
    ["nihao", "你好", 900],
    ["ni", "你", 800],
    ["ni", "尼", 300],
    ["ni", "泥", 200],
    ["ni", "拟", 100],
    ["ni", "逆", 90],
    ["ni", "腻", 80],
    ["nimen", "你们", 700],
    ["hao", "好", 700],
    ["ma", "吗", 600],
    ["jintian", "今天", 800],
    ["tianqi", "天气", 700],
    ["jin", "今", 500],
    ["tian", "天", 500],
    ["zhege", "这个", 800],
    ["wo", "我", 900]
  ],
  next: {
    "你好": ["吗", "啊", "呀", "世界", "朋友", "多余"],
    "吗": ["？"],
    "今天": ["天气"],
    "天气": ["不错"]
  },
  mixed: { "okl": "OK了", "zhegeapphaoyong": "这个app好用", "hw": "hello world" },
  sentences: []
};

var passed = 0;
var failures = 0;
var T = 1000000;
function clock() { return T; }

function mk() { T = 1000000; return Engine(FIXTURE, { now: clock }); }
function keys(e, list) { list.forEach(function (k) { e.press(k); }); }
function type(e, str) { str.split("").forEach(function (c) { e.press(c); }); }
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function check(rule, name, cond, e) {
  if (cond) { passed++; return; }
  failures++;
  console.log("FAIL 规则 " + rule + " · " + name);
  if (e) console.log("  state = " + JSON.stringify(e.state()));
}
function texts(st) { return st.candidates.map(function (c) { return c.text; }); }

// ── 规则 1:切分
(function () {
  var e = mk();
  type(e, "nihao");
  check(1, "nihao → ni|hao", eq(e.state().segments, ["ni", "hao"]), e);
  e = mk(); type(e, "okl");
  check(1, "okl 简拼各字母成段", eq(e.state().segments, ["o", "k", "l"]), e);
  e = mk(); type(e, "zhegeapphaoyong");
  check(1, "zhegeapphaoyong 切不出的字母各成段", eq(e.state().segments, ["zhe", "ge", "a", "p", "p", "hao", "yong"]), e);
  e = mk(); type(e, "jintian");
  check(1, "jintian 最长音节贪心", eq(e.state().segments, ["jin", "tian"]), e);
})();

// ── 规则 2:候选排序 + 每页 5
(function () {
  var e = mk(); type(e, "okl");
  check(2, "mixed 命中排第一", e.state().candidates[0] && e.state().candidates[0].text === "OK了", e);
  e = mk(); type(e, "zhegeapphaoyong");
  check(2, "混打整句第一位", texts(e.state())[0] === "这个app好用", e);
  e = mk(); type(e, "ni");
  var st = e.state();
  check(2, "整段按权重 + 前缀在后,一页 5", eq(texts(st), ["你", "尼", "泥", "拟", "逆"]) && st.pages === 2 && st.page === 0, e);
  check(2, "候选带 code", st.candidates[0].code === "ni", e);
  e = mk(); type(e, "jin");
  check(2, "整段 > 前缀", eq(texts(e.state()), ["今", "今天"]), e);
  // 2026-10-18 契约变更(规则 17 整句):旧断言「前两个 = 你好、你」失效,因为 nihaoma 现在能拼成整句
  // 「你好吗」,整句排在最前;「前几个音节,长的在前」这条本身不变,往后挪一位照样核。
  e = mk(); type(e, "nihaoma");
  check(2, "首几个音节匹配:长的在前(排在整句之后)", eq(texts(e.state()).slice(0, 3), ["你好吗", "你好", "你"]), e);
  e = mk(); type(e, "nihao");
  var t = texts(e.state());
  check(2, "去重(你好 只出现一次)", t.filter(function (x) { return x === "你好"; }).length === 1, e);
})();

// ── 规则 3:数字选字
(function () {
  var e = mk(); type(e, "ni"); e.press("2");
  check(3, "2 选第二个", e.state().committed === "尼" && e.state().buffer === "", e);
  e = mk(); type(e, "ni"); e.press("0"); e.press("7");
  check(3, "0 / 6–9 组合态忽略", e.state().buffer === "ni" && e.state().committed === "", e);
  e = mk(); type(e, "jin"); e.press("5");
  check(3, "超出本页候选数的数字忽略", e.state().buffer === "jin", e);
  e = mk(); e.press("7");
  check(3, "非组合态数字直接落下", e.state().committed === "7", e);
})();

// ── 规则 4:空格
(function () {
  var e = mk(); type(e, "nihao"); e.press("Space");
  check(4, "空格上屏高亮第一个", e.state().committed === "你好", e);
  e.press("Space");
  check(4, "无 buffer 有联想时空格接第一个", e.state().committed === "你好吗" && e.state().lastAction === "predict", e);
  e = mk(); e.press("Space");
  check(4, "否则落空格", e.state().committed === " ", e);
  e = mk(); type(e, "ni"); e.press("="); e.press("Space");
  check(4, "翻页后空格上屏当前页第一个", e.state().committed === "腻", e);
})();

// ── 规则 5:翻页
(function () {
  var e = mk(); type(e, "ni"); e.press("=");
  var st = e.state();
  check(5, "= 下一页", st.page === 1 && eq(texts(st), ["腻", "你好", "你们"]) && st.lastAction === "page", e);
  e.press("=");
  check(5, "最后一页再 = 不越界", e.state().page === 1, e);
  e.press("-");
  check(5, "- 上一页", e.state().page === 0, e);
  e.press("-");
  check(5, "第一页再 - 不越界", e.state().page === 0, e);
  e = mk(); e.press("-"); e.press("=");
  check(5, "无候选原样落字符", e.state().committed === "-=", e);
})();

// ── 规则 6:标点
(function () {
  var e = mk(); type(e, "nihao"); e.press(",");
  var st = e.state();
  check(6, "高亮候选 + 全角逗号一起上屏", st.committed === "你好，" && st.buffer === "", e);
  check(6, "标点上屏不设 undoUntil", st.undoUntil === 0, e);
  e.press("Backspace");
  check(6, "标点上屏退格不退回,只删一个字", e.state().committed === "你好" && e.state().buffer === "", e);
  e = mk(); e.press(".");
  check(6, "中文态非组合落全角句号", e.state().committed === "。", e);
  e = mk(); e.press("Shift"); e.press(","); e.press(".");
  check(6, "英文态半角", e.state().committed === ",.", e);
  e = mk(); type(e, "nihaoma"); e.press(".");
  check(6, "部分覆盖时标点把整段吃完", e.state().committed === "你好吗。" && e.state().buffer === "", e);
})();

// ── 规则 7:Enter
(function () {
  var e = mk(); type(e, "nihao"); e.press("Enter");
  check(7, "组合态 buffer 原样上屏", e.state().committed === "nihao" && e.state().buffer === "" && e.state().undoUntil === 0, e);
  e.press("Backspace");
  check(7, "Enter 上屏不给退回", e.state().committed === "niha" && e.state().buffer === "", e);
  e = mk(); e.press("Enter");
  check(7, "非组合态落换行", e.state().committed === "\n", e);
})();

// ── 规则 8:只覆盖前几个音节
// 2026-10-18 契约变更:nihaoma 的第 1 个候选现在是整句「你好吗」(规则 17),
// 只覆盖前几个音节的「你好」挪到第 2 个,所以这里按 2 选;后面的断言一条没动。
(function () {
  var e = mk(); type(e, "nihaoma"); e.press("2");
  var st = e.state();
  check(8, "选你好后 ma 留在 buffer", st.committed === "你好" && st.buffer === "ma" && eq(st.segments, ["ma"]), e);
  check(8, "未上屏完成不设 undoUntil", st.undoUntil === 0 && st.lastAction !== "commit", e);
  check(8, "剩余拼音候选重算", texts(st)[0] === "吗", e);
  e.press("Space");
  st = e.state();
  check(8, "吃完后才算上屏完成", st.committed === "你好吗" && st.lastAction === "commit" && st.undoUntil === T + 1500, e);
  T += 100; e.press("Backspace");
  check(8, "整段退回为 nihaoma", e.state().committed === "" && e.state().buffer === "nihaoma", e);
})();

// ── 规则 9:上屏后
(function () {
  var e = mk(); type(e, "nihao"); e.press("Space");
  var st = e.state();
  check(9, "undoUntil = now + 1500", st.undoUntil === T + 1500, e);
  check(9, "predictions ≤ 5 按 next", eq(st.predictions, ["吗", "啊", "呀", "世界", "朋友"]), e);
  check(9, "lastAction=commit", st.lastAction === "commit", e);
  e = mk(); type(e, "jin"); e.press("Space");
  check(9, "next 没有该词时联想为空", eq(e.state().predictions, []), e);
})();

// ── 规则 10:退格
(function () {
  var e = mk(); type(e, "nihao"); e.press("Space");
  T += 1500; e.press("Backspace");
  var st = e.state();
  check(10, "1.5 秒内第一下退回拼音", st.committed === "" && st.buffer === "nihao" && st.lastAction === "undo", e);
  check(10, "退回后候选重算、undoUntil 清零、联想清空", texts(st)[0] === "你好" && st.undoUntil === 0 && eq(st.predictions, []), e);
  e.press("Backspace");
  check(10, "第二下照常删拼音", e.state().buffer === "niha" && e.state().lastAction === "type", e);

  e = mk(); type(e, "nihao"); e.press("Space");
  T += 1501; e.press("Backspace");
  check(10, "过期后删一个字", e.state().committed === "你" && e.state().buffer === "", e);

  e = mk(); type(e, "ni"); e.press("Backspace");
  check(10, "组合态删末字母", e.state().buffer === "n" && e.state().committed === "", e);

  e = mk(); type(e, "nihao"); e.press("Space"); e.press("1");
  check(10, "联想接的词不设 undoUntil", e.state().undoUntil === 0 && e.state().committed === "你好吗", e);
  e.press("Backspace");
  check(10, "联想后退格删字不退回", e.state().committed === "你好" && e.state().buffer === "", e);

  e = mk(); type(e, "hw"); e.press("Space");
  check(10, "含空格的上屏不给退回(F8)", e.state().committed === "hello world" && e.state().undoUntil === 0, e);

  e = mk(); type(e, "nihao"); e.press("Space"); type(e, "w"); e.press("Backspace"); e.press("Backspace");
  check(10, "上屏后打过别的键,窗口关闭", e.state().committed === "你" && e.state().buffer === "", e);
})();

// ── 规则 11:Shift
(function () {
  var e = mk(); type(e, "niha"); e.press("Shift");
  var st = e.state();
  check(11, "切 en 时 buffer 原样落下", st.mode === "en" && st.committed === "niha" && st.buffer === "" && st.lastAction === "toggle", e);
  e.press("Shift");
  check(11, "再切回 zh", e.state().mode === "zh", e);
  e = mk(); keys(e, ["N", "I"]);
  check(11, "zh 态大写按小写", e.state().buffer === "ni", e);
  e = mk(); e.press("Shift"); keys(e, ["O", "k"]);
  check(11, "en 态大写原样", e.state().committed === "Ok", e);
})();

// ── 规则 12:en 态直通
(function () {
  var e = mk(); e.press("Shift"); type(e, "ok1-="); e.press("Space"); e.press("Enter");
  var st = e.state();
  check(12, "字母数字标点直接进 committed", st.committed === "ok1-= \n" && st.buffer === "" && eq(st.candidates, []) && eq(st.predictions, []), e);
  e.press("Backspace");
  check(12, "en 态退格删字", e.state().committed === "ok1-= ", e);
})();

// ── 规则 13:Escape
(function () {
  var e = mk(); type(e, "nihao"); e.press("Space"); e.press("Escape");
  check(13, "有联想先收起", eq(e.state().predictions, []) && e.state().committed === "你好", e);
  e = mk(); type(e, "nihao"); e.press("Escape");
  check(13, "否则清 buffer", e.state().buffer === "" && e.state().committed === "" && e.state().lastAction === "clear" && eq(e.state().candidates, []), e);
})();

// ── 规则 14:联想态
(function () {
  var e = mk(); type(e, "jintian"); e.press("Space");
  check(14, "今天 → 联想 天气", eq(e.state().predictions, ["天气"]), e);
  e.press("1");
  var st = e.state();
  check(14, "数字接第 N 个,接上后查下一轮", st.committed === "今天天气" && eq(st.predictions, ["不错"]) && st.undoUntil === 0 && st.lastAction === "predict", e);
  e = mk(); type(e, "nihao"); e.press("Space"); e.press("3");
  check(14, "3 接第三个", e.state().committed === "你好呀", e);
  e = mk(); type(e, "nihao"); e.press("Space"); e.press("w");
  check(14, "字母开始新 buffer 收起联想", eq(e.state().predictions, []) && e.state().buffer === "w", e);
  e = mk(); type(e, "nihao"); e.press("Space"); e.press("8");
  check(14, "联想态 6–9 落数字并收起", e.state().committed === "你好8" && eq(e.state().predictions, []), e);
})();

// ── 规则 15:过期由 now() 判,无定时器
(function () {
  var e = mk(); type(e, "nihao"); e.press("Space");
  var until = e.state().undoUntil;
  T = until; e.press("Backspace");
  check(15, "now == undoUntil 仍可退回(<=)", e.state().lastAction === "undo", e);
  e = mk(); type(e, "nihao"); e.press("Space");
  T += 99999;
  check(15, "不按键时 undoUntil 不被定时器改", e.state().undoUntil === 1000000 + 1500, e);
})();

// ── 规则 16:onChange 与快照
(function () {
  var e = mk();
  var calls = 0;
  var last = null;
  var off = e.onChange(function (st) { calls++; last = st; });
  type(e, "ni"); e.press("Space");
  check(16, "每次 press 调一次 onChange", calls === 3 && last.committed === "你", e);
  e.press("Tab"); e.press("F1");
  check(16, "未知 key 忽略", calls === 3 && e.state().committed === "你", e);
  var a = e.state();
  a.committed = "篡改"; a.predictions.push("x"); a.segments.push("x");
  check(16, "state() 返回新对象,改了不影响引擎", e.state().committed === "你" && e.state() !== e.state(), e);
  off(); e.press("a");
  check(16, "onChange 返回的取消函数有效", calls === 3, e);
  e.reset();
  var st = e.state();
  check(16, "reset 回到初始态", st.committed === "" && st.buffer === "" && st.mode === "zh" && st.lastAction === "" && st.undoUntil === 0, e);
})();

// ── 规则 17:整句
(function () {
  var e = mk(); type(e, "jintiantianqi");
  check(17, "整段拼得完:第一候选是整句", texts(e.state())[0] === "今天天气" && e.state().pages >= 1, e);
  e.press("Space");
  check(17, "整句一次上屏完成、可退回", e.state().committed === "今天天气" && e.state().buffer === "" && e.state().undoUntil === T + 1500, e);
  T += 10; e.press("Backspace");
  check(17, "整句退回为整段拼音", e.state().buffer === "jintiantianqi" && e.state().committed === "", e);

  e = mk(); type(e, "nihaomaw");
  var st = e.state();
  check(17, "拼不完:取能拼的最长一段,剩下的留拼音", st.candidates[0].text === "你好吗" && st.candidates[0].code === "nihaoma", e);
  e.press("Space");
  check(17, "选了之后剩下的 w 留在 buffer", e.state().committed === "你好吗" && e.state().buffer === "w", e);

  e = mk(); type(e, "jint");
  check(17, "只有一个词的最长一段不抢前缀词的位置", texts(e.state())[0] === "今天", e);

  e = mk(); type(e, "nihaox");
  check(17, "一个词 + 拼不了的尾巴:不出整句,照规则 2", texts(e.state())[0] === "你好" && e.state().candidates[0].code === "nihao", e);

  e = mk(); type(e, "wonihao");
  check(17, "词数少的拼法优先(我 + 你好)", texts(e.state())[0] === "我你好", e);

  e = mk(); type(e, "okl");
  check(17, "mixed 仍排在整句前面", texts(e.state())[0] === "OK了", e);

  // 词数相同时取权重和大的:fang+an(方安,1000)对 fan+gan(反感,1800)
  var e2 = Engine({ syllables: ["fan", "fang", "gan", "an"],
                    words: [["fang", "方", 500], ["an", "安", 500], ["fan", "反", 900], ["gan", "感", 900]] }, { now: clock });
  type(e2, "fangan");
  check(17, "词数相同取权重和大的拼法", texts(e2.state())[0] === "反感", e2);
})();

// ── runScript
(function () {
  var e = mk();
  var steps = [];
  var n = e.runScript("n i h a o {space} {wait:800} 1 {shift} o k {shift} {bs} , {enter} {esc}", function (tok, st) { steps.push(tok); });
  check("S", "runScript 返回按键数(跳过 wait)", n === 15 && steps.length === 15 && steps.indexOf("{wait:800}") < 0, e);
  check("S", "runScript 结果", e.state().committed === "你好吗o，\n", e);
})();

// ── 真词表:验收句 + 10 个场景(载入 demo-words.js)
(function () {
  var W = require(path.join(__dirname, "demo-words.js"));
  var ACCEPT = [
    ["womenmingtianjianmian", "我们明天见面"],
    ["jintianxiawukaihui", "今天下午开会"],
    ["xiexienidebangzhu", "谢谢你的帮助"],
    ["wozhengzaixiebaogao", "我正在写报告"],
    ["zhegewentiwomenzaitaolun", "这个问题我们再讨论"],
    ["qingnibangwokanyixia", "请你帮我看一下"],
    ["zhegefanganhenhao", "这个方案很好"],
    ["wanshangyiqichifan", "晚上一起吃饭"],
    ["wojintianhenmang", "我今天很忙"],
    ["xuyaoshijianzhunbei", "需要时间准备"]
  ];
  ACCEPT.forEach(function (a) {
    var e = Engine(W, { now: clock });
    type(e, a[0]);
    var c = e.state().candidates[0];
    check("W", a[0] + " 第一候选 = " + a[1], c && c.text === a[1] && c.code === a[0], e);
    e.press("Space");
    check("W", a[0] + " 空格整句上屏", e.state().committed === a[1] && e.state().buffer === "", e);
  });
  // 10 个场景演完的结果:2026-10-18 改动前在基线 e1c3f61 上实跑抄下(场景 7 的脚本从 1 1 1 改为 2 2 1,结果不变)
  var SCENES = ["你好吗", "今天天气", "OK了", "感觉怪怪的", "你好", "ok 好的", "明天下午三点", "这个app好用", "世", "好的，"];
  check("W", "恰 10 个场景", W.sentences.length === 10);
  W.sentences.forEach(function (sen, i) {
    var e = Engine(W, { now: clock });
    e.runScript(sen.script);
    check("W", "场景 " + (i + 1) + " 演完 = " + SCENES[i], e.state().committed === SCENES[i] && e.state().buffer === "", e);
  });
  // 场景 7 的意思是「分段挑」:第一下选的必须只是前一段
  var e7 = Engine(W, { now: clock });
  type(e7, "mingtianxiawusandian"); e7.press("2");
  check("W", "场景 7 第一下只选了「明天」", e7.state().committed === "明天" && e7.state().buffer === "xiawusandian", e7);
})();

if (failures) {
  console.log("demo-selftest: " + failures + " failed, " + passed + " passed");
  process.exit(1);
}
console.log("demo-selftest: " + passed + " passed");
process.exit(0);
