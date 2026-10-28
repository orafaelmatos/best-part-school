export function isLocalDevelopmentOrigin(value: string): boolean {
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  const octets = url.hostname.split(".").map(Number);
  const privateIp = octets.length === 4 && octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) && (
    octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
  return url.protocol === "http:" && !url.username && !url.password &&
    (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.hostname.endsWith(".local") || privateIp);
}

/** The only permitted proxy destination is Django on this Mac. */
export function localApiProxyTarget(value = "8000"): string {
  if (!/^\d+$/.test(value)) throw new Error("BPS_LOCAL_API_PORT precisa ser uma porta local válida.");
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("BPS_LOCAL_API_PORT precisa estar entre 1024 e 65535.");
  return `http://127.0.0.1:${port}`;
}
