// 付款结果页(/thanks/ 与 /en/thanks/ 共用这一份;语言看 <html lang>)。
// Stripe 会把 session_id 拼在成功地址后面(付款链接后台把成功地址设成 /thanks/?session_id={CHECKOUT_SESSION_ID} 时)。
// SEC-FIX-A L6:页面静态内容是中性的「付款结果」;只有带 session_id 时才换成「付款完成」并亮对勾。
//   ⛔ 不写死「付款成功」,也不写档位名:直接打开这个 URL 的人什么都没付。
// ⛔ 不拿 session_id 做任何鉴权 —— 真正开通会员的唯一依据是 Stripe 打给服务器的带签名的 webhook。
//    这一页是纯展示,连一个请求都不发。⛔ 只用 textContent。
(function () {
  var EN = /^en/i.test(document.documentElement.lang || "");
  var T = EN ? {
    head: "Payment complete",
    hint: "Your membership will be active within a minute. If the app has not changed, sign in with the email you paid with.",
  } : {
    head: "付款完成",
    hint: "会员会在一分钟内生效。如果 App 里没变,用付款邮箱登录一次。",
  };
  var sid = new URLSearchParams(location.search).get("session_id");
  if (!sid) return;                                 // 没带:保持页面上的中性说法
  document.getElementById("tick").hidden = false;
  document.getElementById("head").textContent = T.head;
  document.getElementById("hint").textContent = T.hint;
  document.title = T.head + " · Murmur";
  // 换语言时把 session_id 带过去,另一边也显示「付款完成」
  var sw = document.getElementById("langSwitch");
  if (sw) sw.setAttribute("href", sw.getAttribute("href") + "?session_id=" + encodeURIComponent(sid));
})();
