import type { CapacitorConfig } from "@capacitor/cli";

// Live reload has its own ignored native project. The distributable ios/ project
// always loads its bundled web assets, even after an interrupted dev session.
const mobileDevelopment = process.env.BPS_MOBILE_DEV === "1";
const liveReloadUrl = process.env.BPS_LIVE_RELOAD_URL;
if ((mobileDevelopment || liveReloadUrl) && process.env.NODE_ENV === "production") {
  throw new Error("Live reload não pode ser usado em produção. Remova BPS_MOBILE_DEV e BPS_LIVE_RELOAD_URL.");
}
if (liveReloadUrl) {
  const url = new URL(liveReloadUrl);
  const octets = url.hostname.split(".").map(Number);
  const privateIp = octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) && (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
  const localHost = ["localhost", "127.0.0.1"].includes(url.hostname) || url.hostname.endsWith(".local") || privateIp;
  if (!mobileDevelopment || !localHost || url.protocol !== "http:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Use npm run mobile:live:ios: live reload aceita apenas HTTP local em ambiente de desenvolvimento.");
  }
}

const config: CapacitorConfig = {
  appId: "com.bestpartschool.student",
  appName: "Best Part School",
  webDir: "dist/student",
  server: {
    androidScheme: "https",
    iosScheme: "capacitor",
    cleartext: Boolean(liveReloadUrl),
    ...(liveReloadUrl ? { url: liveReloadUrl } : {}),
  },
  ...(mobileDevelopment ? { ios: { path: ".mobile-live-ios" } } : {}),
  plugins: {
    Keyboard: { resize: "native" },
  },
};

export default config;
