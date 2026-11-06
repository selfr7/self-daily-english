// 防跨站写入：浏览器发来的 Origin 必须和用户实际访问的地址（Host）一致。
// 不用 new URL(req.url).origin：本地服务会把 127.0.0.1、局域网 IP 都规整成 localhost，导致合法请求被拒。
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
