// 首页脚本(SEC-FIX-A L3:原来是页内两段内联 <script>,搬出来是为了 CSP 去掉 script-src 'unsafe-inline')。
// 一字未改,只把两段按原顺序接在一起;原先第一段在 capsule.js 之前,它只碰 #capLines,和 capsule.js 互不相干。
// ⚠️ 中英两份(/home.js 与 /en/home.js)逻辑同构,只有演示文案不一样。改逻辑两边一起改。
// ── 实时字幕演示:和其它演示同一条纪律 —— 代码画的,不是视频 ──
(function () {
  var box = document.getElementById('capLines');
  if (!box) return;
  // 左原文、右译文:和 App 字幕窗打开第二栏时一样(译文只出定稿,所以整行一起出现)
  var lines = [
    ["我们先过一下这周的进度,设计稿周三定下来。", "Let's go over this week's progress first. The designs are final on Wednesday."],
    ["测试那边还有两个问题,周五之前能修完。", "Testing still has two open issues. They will be fixed before Friday."],
    ["上线时间不变,还是下周一。", "The launch date stays the same: next Monday."],
    ["还有问题的话,会后在群里说。", "If anything else comes up, post it in the group chat after the meeting."]
  ];
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function row(l) {
    var r = document.createElement('div');
    r.className = 'cap-row';
    var a = document.createElement('p'); a.textContent = l[0]; a.lang = 'zh-Hans';
    var b = document.createElement('p'); b.textContent = l[1]; b.className = 'tr'; b.lang = 'en';
    r.appendChild(a); r.appendChild(b);
    return r;
  }
  function render(n) {
    box.innerHTML = '';
    for (var i = 0; i < n; i++) { var r = row(lines[i]); r.classList.add('on'); box.appendChild(r); }
  }
  if (reduced) { render(lines.length); return; }
  var shown = 0;
  function tick() {
    if (shown >= lines.length) { shown = 0; box.innerHTML = ''; }
    var r = row(lines[shown]);
    box.appendChild(r);
    requestAnimationFrame(function () { requestAnimationFrame(function () { r.classList.add('on'); }); });
    shown++;
  }
  tick();
  setInterval(tick, 2600);
})();

/* ── 入场:滚到哪节哪节醒。只动 transform/opacity ── */
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) {
    const idx = [...e.target.parentElement.querySelectorAll(':scope > .reveal')].indexOf(e.target);
    e.target.style.transitionDelay = `${Math.max(idx, 0) * 60}ms`;
    e.target.classList.add('on');
    io.unobserve(e.target);
  }
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

/* ─────────────────────────────────────────────────────────
   演示引擎:所有演示都是「时间的纯函数」——每帧只按 (当前循环
   时刻) 算出该显示什么,没有状态机可以跑飞;不可见就整段跳过。
   ───────────────────────────────────────────────────────── */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const demos = [];
function register(el, render) {
  const d = { el, render, visible: false, start: performance.now() };
  new IntersectionObserver(es => {
    // 重新滚回来时从头播,别接在循环中段
    if (es[0].isIntersecting && !d.visible) d.start = performance.now();
    d.visible = es[0].isIntersecting;
  }, { threshold: 0.3 }).observe(el);
  demos.push(d);
}

/* 「说话」演示:待命 → 按右 ⌘ → 正在打开麦克风 → 听(逐词字幕 + 声线随音量起伏)
   → 再按 → 整理中(一个字都不写,液带收成细平线,1.2s 后线上一颗慢亮点)
   → 原话原位换成整理后的句子 + 右槽「✓ 已插入」(字落下)→ 下沉淡出 → 停留(App 录音条 v2) */
function speakDemo(root, { words, result, per = 420, hold = 2600, cycleOverride = 0, onPhase,
                           mode = 'dictation', scale = 0, kbd = null }) {
  const input = root.querySelector('.out'), ph = root.querySelector('.ph');
  const mount = root.querySelector('.capsule-mount');
  const cap = MurmurCapsule.mount(mount, {
    size: mount.dataset.size || 'full', caption: mount.dataset.caption || 'above', mode,
    scale: scale || undefined
  });
  const D = MurmurCapsule.DWELL;
  // 说完静 300ms:进整理中时离上一次计时翻页够远,不带半截数字退场;整理段 1700ms:过了 1.2s 亮点出来走半秒
  const tPress = 800, tListen = tPress + D.starting, listen = per * words.length + 300;
  const tProc = tListen + listen, proc = 1700, tDone = tProc + proc, typeMs = 34;
  const tHide = tDone + D.done;
  const doneAt = tDone + result.length * typeMs;
  const cycle = cycleOverride || Math.max(doneAt + hold, tHide + 800);

  // 假电平:每 85ms 一个台阶(= Mac 的音频缓冲节拍),组件自己平滑(SPEC §6.4)
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const levelAt = dt => {
    const b = Math.floor(dt / 85), tb = b * 85, w = Math.floor(tb / per);
    if (w >= words.length) return 0;
    const p = (tb % per) / per;
    const base = p < 0.82 ? 0.35 + 0.35 * Math.sin(Math.PI * p / 0.82) : 0.15;
    return Math.max(0, Math.min(1, base + (hash(b) - 0.5) * 0.16));
  };
  const last = {};
  const set = (k, v, fn) => { if (last[k] !== v) { last[k] = v; fn(v); } };

  register(root, (now, tRaw) => {
    const t = tRaw % cycle;
    if (reduced) {                                      // 减弱动效:字照样落下,胶囊停在「说话时」那一帧
      set('reduced', true, () => {
        if (ph) ph.style.display = 'none';
        input.textContent = result;
        cap.setClock(Math.floor(listen / 1000));
        cap.setCaption(words.join(''), '');
        cap.setState('listening', { level: 0.55 });   // 静止波形 + 整句字幕;不留一块空的文字区
      });
      onPhase && onPhase('done', doneAt, t);
      return;
    }
    if (kbd) set('press', (t >= tPress && t < tPress + 160) || (t >= tProc && t < tProc + 160),
                 v => kbd.classList.toggle('is-pressed', v));
    const typed = t < tDone ? 0 : Math.min(result.length, Math.floor((t - tDone) / typeMs));
    set('typed', typed, n => { input.textContent = result.slice(0, n); if (ph) ph.style.display = n ? 'none' : ''; });

    const state = t < tPress ? 'hidden' : t < tListen ? 'starting' : t < tProc ? 'listening'
                : t < tDone ? 'processing' : t < tHide ? 'done' : 'hidden';
    set('state', state, s => {
      if (s === 'done') cap.setState('done', { text: result });
      else if (s === 'processing') { cap.setCaption(words.join(''), ''); cap.setState('processing', { seconds: 0 }); }
      else if (s === 'listening') { cap.setClock(0); cap.setState('listening', { level: 0 }); }
      else cap.setState(s);
    });
    if (state === 'listening') {
      const dt = t - tListen;
      set('level', Math.floor(dt / 85), () => cap.setLevel(levelAt(dt)));
      set('clock', Math.floor(dt / 1000), s => cap.setClock(s));
      const shown = Math.min(Math.floor(dt / per) + 1, words.length);
      set('words', shown, n => cap.setCaption(words.slice(0, n - 1).join(''), words[n - 1]));
    } else { last.level = last.clock = last.words = undefined; }
    if (state === 'processing') set('proc', Math.floor((t - tProc) / 500) * 0.5, s => cap.setProcessingSeconds(s));
    else last.proc = undefined;

    onPhase && onPhase(t < tPress ? 'idle' : t < tProc ? 'listen' : t < tDone ? 'process'
                       : t >= doneAt ? 'done' : 'typing', doneAt, t);
  });
  return { doneAt, hideAt: tHide + MurmurCapsule.MOTION.hudHide };   // hideAt = 胶囊完全收起的时刻
}

/* 「打字」演示:type/pause/del 的脚本,编译成 (时刻 → 文本) */
function typeDemo(root, ops, { cycleOverride = 0, onPhase }) {
  const input = root.querySelector('.out');
  const frames = [];                                    // [时刻, 文本] 关键帧
  let text = '', t = 1200;                              // 起步先想 1.2s —— 打字前总要先措辞
  frames.push([0, '']);
  for (const op of ops) {
    if (op.type) for (const ch of op.type) { t += op.per || 170; text += ch; frames.push([t, text]); }
    if (op.del) for (let i = 0; i < op.del; i++) { t += 90; text = text.slice(0, -1); frames.push([t, text]); }
    if (op.pause) t += op.pause;
  }
  const doneAt = t;
  const cycle = cycleOverride || doneAt + 2600;

  register(root, (now, tRaw) => {
    const tc = tRaw % cycle;
    if (reduced) { input.textContent = frames[frames.length - 1][1]; onPhase && onPhase('done', doneAt, tc); return; }
    let cur = '';
    for (const [ft, ftext] of frames) { if (ft <= tc) cur = ftext; else break; }
    input.textContent = cur;
    onPhase && onPhase(tc >= doneAt ? 'done' : 'typing', doneAt, tc);
  });
  return { doneAt };
}

/* ── Hero:一场就够,讲清「说完,字落下」── */
const heroMount = document.querySelector('#demo .capsule-mount');
heroMount.dataset.size = matchMedia('(max-width: 420px)').matches ? 'mini' : 'full';   // 390 宽舞台放不下 full
speakDemo(document.getElementById('demo'), {
  words: ['今天的', '会议纪要', '我', '晚点', '发给', '大家'],
  result: '今天的会议纪要,我晚点发给大家。',
  scale: matchMedia('(max-width: 360px)').matches ? 0.75 : 0,
});

/* ── 少一道工序:同一句话,两边同一个循环、同时开跑 ── */
const SAME_CYCLE = 13000;
const speakPanel = document.getElementById('panelSpeak');
const typePanel = document.getElementById('panelType');

function timerPhase(panel) {
  const timer = panel.querySelector('.timer');
  return (phase, doneAt, t) => {
    const frozen = Math.min(t, doneAt);
    timer.textContent = `0:${String(Math.floor(frozen / 1000)).padStart(2, '0')}`;
    timer.classList.toggle('done', t >= doneAt);
  };
}
const speakChip = speakPanel.querySelector('.done-chip');
const sp = speakDemo(speakPanel, {
  words: ['明天', '下午三点', '老地方', '见'],
  result: '明天下午三点,老地方见。',
  cycleOverride: SAME_CYCLE,
  onPhase: (phase, doneAt, t) => {
    timerPhase(speakPanel)(phase, doneAt, t);
    speakChip.classList.toggle('on', phase === 'done' && t >= sp.hideAt);   // 胶囊自己演过「已插入」,收起后 chip 才亮
  },
});
typeDemo(typePanel, [
  { type: '明天下午三点我们' }, { pause: 1100 },
  { del: 2 }, { type: '在老地方' }, { pause: 1000 },
  { del: 4 }, { pause: 800 },
  { type: ',老地方见' }, { pause: 800 },
  { type: '。' },
], { cycleOverride: SAME_CYCLE, onPhase: timerPhase(typePanel) });

/* ── 三个核心功能的展示区 ── */
speakDemo(document.getElementById('fdemoDictate'), {
  scale: 0.8,
  words: ['嗯…', '那个,', '明天上午十点', '提醒我', '给妈妈', '打个电话'],
  result: '明天上午十点,提醒我给妈妈打个电话。',   // 口水词在字幕里,不在成品里
});
speakDemo(document.getElementById('fdemoTranslate'), {
  mode: 'translate', scale: 0.8,
  words: ['这个周末', '我们', '去看电影', '怎么样'],
  result: 'How about we go see a movie this weekend?',
});
speakDemo(document.getElementById('fdemoAsk'), {
  mode: 'ask', scale: 0.8,
  words: ['一英里', '等于', '多少', '公里'],
  result: '1 英里 ≈ 1.609 公里',                    // 落下的是答案,不是问题
});

/* ── 拼音打字演示(#pinyin):和上面的演示同一个引擎,每帧只按循环里的时刻算 ──
   ① 敲 shu ru fa,按 1 上屏「输入法」 ② 再打一遍,选错按了 4 上屏「书如法」,
   1.5 秒内退格,整个词退回拼音,重选 1。一轮 9 秒,停 1.5 秒再来。 */
function pinyinDemo(root, caps) {
  if (!root) return;
  const doc = root.querySelector('.py-doc-text'), timer = root.querySelector('.py-timer');
  const panel = root.querySelector('.py-panel'), py = root.querySelector('.py-pinyin');
  const cands = [...root.querySelectorAll('.py-cand')], cap = root.querySelector('.py-demo-cap');
  const KEYS = ['s', 'sh', 'shu', 'shu r', 'shu ru', 'shu ru f', 'shu ru fa'];
  const SETS = [
    ['是', '说', '上', '时', '所'], ['是', '说', '上', '时', '生'], ['书', '数', '输', '树', '属'],
    ['输入', '书', '数', '树', '属'], ['输入', '书', '数', '树', '属'], ['输入法', '输入', '书', '数', '树'],
    ['输入法', '输入', '书', '书如法', '数'],
  ];
  const T = { a: 400, aPer: 140, pick: 2500, clear: 3700, b: 3900, bPer: 110,
              wrong: 5200, commitWrong: 5450, back: 6250, repick: 7400, end: 9000 };
  const CYCLE = T.end + 1500;                           // 轮间停 1.5 秒(停在最后一帧)
  const typed = (t, t0, per) => Math.max(0, Math.min(KEYS.length, Math.floor((t - t0) / per)));
  function at(t) {                                      // 时刻 → { 文档里的字, 拼音键数(0 = 不显示候选窗), 高亮第几个, 说明, 退格窗口剩多少 }
    if (t < T.pick)        return { text: '', n: typed(t, T.a, T.aPer), on: 0, c: 0 };
    if (t < T.clear)       return { text: '输入法', n: 0, c: 1 };
    if (t < T.wrong)       return { text: '', n: t < T.b ? 0 : typed(t, T.b, T.bPer), on: 0, c: 2 };
    if (t < T.commitWrong) return { text: '', n: KEYS.length, on: 3, c: 3 };
    if (t < T.back)        return { text: '书如法', n: 0, c: 3, left: 1 - (t - T.commitWrong) / 1500 };
    if (t < T.repick)      return { text: '', n: KEYS.length, on: 0, c: 4 };
    return { text: '输入法', n: 0, c: 5 };
  }
  let last = '';
  function paint(f) {
    const key = [f.text, f.n, f.on, f.c, f.left ? Math.round(f.left * 100) : 0].join('|');
    if (key === last) return;
    last = key;
    doc.textContent = f.text;
    if (f.text) doc.appendChild(timer);                 // 细线挂在字下面,随字走
    timer.style.width = f.left ? (f.left * 100).toFixed(1) + '%' : '0';
    panel.classList.toggle('off', f.n === 0);
    if (f.n > 0) {                                      // 候选窗收起时保留最后的内容,淡出才不空
      py.textContent = KEYS[f.n - 1];
      SETS[f.n - 1].forEach((w, i) => { cands[i].lastChild.textContent = w; });
      cands.forEach((el, i) => el.classList.toggle('on', i === f.on));
    }
    cap.textContent = caps[f.c];
  }
  if (reduced) { paint(at(T.end)); return; }           // 减弱动效:只给最后一帧
  register(root, (now, tRaw) => paint(at(tRaw % CYCLE)));
}
pinyinDemo(document.getElementById('pyDemo'), ["敲拼音 shu ru fa", "按 1,上屏「输入法」", "再打一遍", "选错了:按 4,上屏「书如法」", "1.5 秒内按退格,整个词退回拼音", "重选 1,上屏「输入法」"]);


/* ── 唯一的 rAF 循环:不可见的演示整段跳过 ── */
function loop(now) {
  requestAnimationFrame(loop);
  for (const d of demos) if (d.visible) d.render(now, now - d.start);
}
requestAnimationFrame(loop);
