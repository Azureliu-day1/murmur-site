// ── Turnstile site key:全站只有这一处(TURNSTILE,2026-10-21)──────────────────
// login / try / skills(中英六个脚本)都从这里 import,⛔ 别在页面脚本里再写一份。
//
// 10-21 已换成正式 key(Wei 建的 widget,maobenbeginner.com,Managed);本地要测就临时换回官方测试 key「恒过」(1x00000000000000000000AA),
// https://developers.cloudflare.com/turnstile/troubleshooting/testing/ —— 本地、预览都能出验证框、拿到票;
// 它发的票只有 Cloudflare 测试 secret 核得过,生产 secret 一张都不认(服务端那头见 murmur-web 的 TURNSTILE_TEST_SECRETS)。
// ⚠️ 上线前由领导者换成 Cloudflare 后台给 maobenbeginner.com 建的正式 key(widget 的 action 用 web-access / web-trial),
//    换完跑 server/supabase/functions/murmur-web/turnstile-ready.sh <站点仓> —— 还是测试 key 它会红。
// 这是公开的 site key,不是密钥(密钥 TURNSTILE_SECRET 只在 Edge secrets 里)。
export const TURNSTILE_SITEKEY = "0x4AAAAAAFezTdW4-bGQ4O-S";
