// Stripe 会把 session_id 拼在成功地址后面(付款链接后台把成功地址设成 /thanks/?session_id={CHECKOUT_SESSION_ID} 时)。
// 它只用来在这一页做一件事:没带它的人(直接开了这个 URL)看到的提示换一句。
// ⛔ 不拿它做任何鉴权 —— 真正开通会员的唯一依据是 Stripe 打给服务器的带签名的 webhook。
//    这一页是纯展示,连一个请求都不发。⛔ 只用 textContent。
(function () {
  var q = new URLSearchParams(location.search);
  if (!q.get("session_id")) {
    document.getElementById("hint").textContent = "这一页只在付款完成后显示。如果你刚付完,回到 App 用付款邮箱登录一次。";
  }
})();
