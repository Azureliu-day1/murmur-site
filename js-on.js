// 首页在 <head> 里先打一个 js 标记,让「没 JS 时全部显示」的样式退场(SEC-FIX-A L3:原来是内联一行,CSP 去掉 unsafe-inline 后搬到这里)。
document.documentElement.classList.add('js');
