/* 404 页的语言切换(体检 #6):GitHub Pages 对 /en/ 下不存在的地址也回根目录这一张 404.html。
   路径以 /en/ 开头时换成英文:改 <html lang>、标题、描述,把带 data-en 的元素换成英文文字,
   data-en-href 换链接,data-en-lang 换 lang 属性;data-zh-only 的(中文版里那行英文)去掉。
   没有脚本时页面照旧是中文 + 一行英文 + English home 按钮。 */
(function () {
  if (!/^\/en(\/|$)/.test(location.pathname)) return;
  document.documentElement.lang = 'en';
  document.title = 'Page not found · Murmur';
  var desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', 'There is no page at this address. Try the home page.');
  var i, els;
  els = document.querySelectorAll('[data-en]');
  for (i = 0; i < els.length; i++) els[i].textContent = els[i].getAttribute('data-en');
  els = document.querySelectorAll('[data-en-href]');
  for (i = 0; i < els.length; i++) els[i].setAttribute('href', els[i].getAttribute('data-en-href'));
  els = document.querySelectorAll('[data-en-lang]');
  for (i = 0; i < els.length; i++) {
    var l = els[i].getAttribute('data-en-lang');
    els[i].setAttribute('lang', l);
    if (els[i].hasAttribute('hreflang')) els[i].setAttribute('hreflang', l);
  }
  els = document.querySelectorAll('[data-zh-only]');
  for (i = els.length - 1; i >= 0; i--) els[i].parentNode.removeChild(els[i]);
})();
