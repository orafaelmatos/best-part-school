import { spawn } from "node:child_process";
import { cp, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { loadEnv } from "vite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const developmentPath = join(root, ".mobile-live-ios");
const capacitorBin = join(root, "node_modules/@capacitor/cli/bin/capacitor");
const viteBin = join(root, "node_modules/vite/bin/vite.js");
const markerPath = join(developmentPath, ".best-part-live-reload");
const lockPath = join(root, ".mobile-live-ios.lock");

export function parseOptions(args) {
  const options = { host: "localhost", port: 8080, open: true, help: false, localApi: false, apiPort: 8000 };
  let apiPortSpecified = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--no-open") options.open = false;
    else if (arg === "--local-api") options.localApi = true;
    else if (arg === "--host" || arg === "--port" || arg === "--api-port") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`Informe um valor para ${arg}.`);
      if (arg === "--api-port") {
        options.apiPort = Number(value);
        apiPortSpecified = true;
      } else options[arg.slice(2)] = arg === "--port" ? Number(value) : value;
    } else throw new Error(`Opção desconhecida: ${arg}. Use --help.`);
  }
  const parts = options.host.split(".");
  const octets = parts.map(Number);
  const privateIp = parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part)) && octets.every((part) => part >= 0 && part <= 255) && (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
  const localName = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+local$/i.test(options.host);
  if (!["localhost", "127.0.0.1"].includes(options.host) && !privateIp && !localName) {
    throw new Error("--host deve ser localhost ou o IPv4 privado/nome .local do seu Mac, sem http:// e sem porta.");
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error("--port deve ser um número entre 1024 e 65535.");
  }
  if (!Number.isInteger(options.apiPort) || options.apiPort < 1024 || options.apiPort > 65535) {
    throw new Error("--api-port deve ser um número entre 1024 e 65535.");
  }
  if (apiPortSpecified && !options.localApi) throw new Error("Use --api-port junto de --local-api.");
  if (options.localApi && options.port === options.apiPort) throw new Error("Vite e API precisam de portas diferentes. Use --port 8080 e --api-port 8000, por exemplo.");
  return options;
}

export function developmentEnvironment(options, inherited = process.env) {
  return {
    ...inherited,
    NODE_ENV: "development",
    BPS_MOBILE_DEV: "1",
    BPS_LIVE_RELOAD_URL: `http://${options.host}:${options.port}`,
    // An explicit CLI option owns this switch, regardless of .env or shell values.
    VITE_LOCAL_API: options.localApi ? "1" : "0",
    ...(options.localApi ? {
      BPS_LOCAL_API_PORT: String(options.apiPort),
      VITE_API_URL: "/api/",
      VITE_MEDIA_BASE_URL: "",
    } : {}),
  };
}

export async function preflightLocalApi(apiPort, fetchRequest = fetch) {
  if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535) throw new Error("Porta da API local inválida.");
  const origin = `http://127.0.0.1:${apiPort}`;
  try {
    const response = await fetchRequest(`${origin}/api/local/health/`, {
      redirect: "error",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`o diagnóstico local retornou HTTP ${response.status}`);
    const health = await response.json();
    if (health.mode !== "mobile-local" || health.database !== "sqlite-local") {
      throw new Error("a porta não está servindo o backend isolado de desenvolvimento mobile");
    }
  } catch (error) {
    throw new Error(`A API local não está pronta em ${origin}: ${error.message}.\nEm outro terminal, inicie npm run dev:api:mobile e mantenha-o aberto. Consulte docs/TESTAR_API_LOCAL.md. Nenhuma API externa será usada como alternativa.`);
  }
}

function validateApiConfig() {
  const environment = { ...loadEnv("student", root, ""), ...process.env };
  for (const key of ["VITE_API_URL", "VITE_MEDIA_BASE_URL"]) {
    const value = environment[key];
    if (!value && key === "VITE_MEDIA_BASE_URL") continue;
    let url;
    try { url = new URL(value); } catch { /* Friendly error below. */ }
    if (!url || url.protocol !== "https:" || url.username || url.password || url.search || url.hash || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      throw new Error(`Configure ${key} com uma URL HTTPS acessível pelo iPhone em .env.student.local. Consulte docs/TESTAR_NO_IPHONE.md. O HTTP local deste comando serve apenas a interface.`);
    }
  }
}

async function command(binary, args, env, children, { capture = false } = {}) {
  const child = spawn(binary, args, { cwd: root, env, shell: false, stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
  children.add(child);
  let output = "";
  if (capture) {
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
  }
  try {
    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${binary === process.execPath ? args[0].split("/").at(-1) : binary} encerrou (${signal || code}).${output ? `\n${output.trim()}` : ""}`)));
    });
    return output;
  } finally { children.delete(child); }
}

async function checkPort(port) {
  await new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once("error", (error) => reject(new Error(error.code === "EADDRINUSE"
      ? `A porta ${port} já está ocupada. Escolha outra com --port ${port < 65535 ? port + 1 : port - 1}. Este comando não encerra servidores existentes.`
      : `Não foi possível abrir a porta ${port} (${error.code}). Execute o comando em um terminal com acesso à rede local.`)));
    socket.listen(port, "0.0.0.0", () => socket.close(resolve));
  });
}

export function developmentPlist(original) {
  if (original.includes("NSAppTransportSecurity") || original.includes("NSLocalNetworkUsageDescription")) {
    throw new Error("O Info.plist mudou suas regras de rede. Revise scripts/mobile-live.mjs antes de gerar a cópia de desenvolvimento.");
  }
  return original.replace(/<dict>/, `<dict>
  <key>NSLocalNetworkUsageDescription</key>
  <string>Durante o desenvolvimento, conecta ao seu Mac para atualizar a interface do aplicativo.</string>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
  </dict>`);
}

async function prepareDevelopmentProject() {
  try {
    await stat(developmentPath);
    await stat(markerPath);
    return; // Keep the developer's local signing/team selection between sessions.
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    try {
      await stat(developmentPath);
      throw new Error(".mobile-live-ios já existe e não foi criado por este comando. Renomeie esse diretório antes de continuar.");
    } catch (existingError) {
      if (existingError.code !== "ENOENT") throw existingError;
    }
  }

  await cp(join(root, "ios"), developmentPath, {
    recursive: true,
    filter(source) {
      const pathParts = relative(join(root, "ios"), source).split("/");
      return !pathParts.some((part) => ["public", "Pods", "build", "DerivedData", "xcuserdata", "capacitor.config.json"].includes(part));
    },
  });
  const plistPath = join(developmentPath, "App/App/Info.plist");
  await writeFile(plistPath, developmentPlist(await readFile(plistPath, "utf8")));
  const delegatePath = join(developmentPath, "App/App/AppDelegate.swift");
  await writeFile(delegatePath, `${await readFile(delegatePath, "utf8")}\n#if !DEBUG\n#error("Este projeto serve apenas ao live reload em Debug. Para distribuir, use ios/App/App.xcodeproj após npm run mobile:sync.")\n#endif\n`);
  await writeFile(markerPath, "Projeto local de desenvolvimento, gerado por scripts/mobile-live.mjs.\n");
}

async function resetDevelopmentServer() {
  const path = join(developmentPath, "App/App/capacitor.config.json");
  try {
    const config = JSON.parse(await readFile(path, "utf8"));
    if (config.server) {
      delete config.server.url;
      config.server.cleartext = false;
    }
    await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function acquireSession() {
  try {
    await writeFile(lockPath, String(process.pid), { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const previousPid = Number(await readFile(lockPath, "utf8"));
    if (!Number.isInteger(previousPid) || previousPid <= 0) throw new Error("Sessão de live reload inválida. Encerre as outras sessões e remova .mobile-live-ios.lock.");
    try {
      process.kill(previousPid, 0);
    } catch (pidError) {
      if (pidError.code !== "ESRCH") throw pidError;
      await unlink(lockPath);
      await writeFile(lockPath, String(process.pid), { flag: "wx" });
      return;
    }
    throw new Error("Já há uma sessão de live reload iOS aberta. Encerre-a com Control + C antes de iniciar outra.");
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log(`Atualização ao salvar no Simulator ou no iPhone (somente desenvolvimento).

API local, primeiro terminal: npm run dev:api:mobile
Simulator + API local:       npm run mobile:live:ios:local
iPhone + API local:          npm run mobile:live:ios:local -- --host 192.168.1.20
API HTTPS configurada:      npm run mobile:live:ios
Opções: --local-api | --api-port 8000 | --port 8081 | --no-open | --help

No modo --local-api, API e banco são locais; valores remotos de .env são ignorados.
Sem --local-api, requer API HTTPS em .env.student.local.
Requer Xcode 26+ e Mac/iPhone na mesma rede para testar no aparelho.
O projeto de desenvolvimento fica em .mobile-live-ios/; ios/ não é alterado.
Guia: docs/TESTAR_NO_IPHONE.md`);
    return;
  }
  if (process.platform !== "darwin") throw new Error("Para executar iOS, use um Mac com Xcode 26 ou superior.");
  if (process.env.NODE_ENV === "production") throw new Error("Live reload exige ambiente de desenvolvimento; remova NODE_ENV=production.");
  if (options.localApi) await preflightLocalApi(options.apiPort);
  else validateApiConfig();

  const children = new Set();
  const controller = new AbortController();
  const requestStop = () => {
    controller.abort();
    for (const child of children) child.kill("SIGTERM");
  };
  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);
  const environment = developmentEnvironment(options);
  let serverResult;
  let ownsSession = false;
  try {
    let version;
    try { version = await command("xcodebuild", ["-version"], process.env, children, { capture: true }); }
    catch { throw new Error("Instale e abra o Xcode completo. Em Xcode > Settings > Locations, selecione Command Line Tools. Consulte docs/TESTAR_NO_IPHONE.md."); }
    if (Number(version.match(/Xcode (\d+)/)?.[1] || 0) < 26) throw new Error("Capacitor 8 precisa de Xcode 26 ou superior.");
    controller.signal.throwIfAborted();
    await checkPort(options.port);
    controller.signal.throwIfAborted();
    await acquireSession();
    ownsSession = true;
    await prepareDevelopmentProject();
    controller.signal.throwIfAborted();
    serverResult = command(process.execPath, [viteBin, "--mode", "student", "--host", "0.0.0.0", "--port", String(options.port), "--strictPort"], environment, children)
      .then(() => ({ stopped: true }), (error) => ({ error }));
    for (let attempts = 0; attempts < 100; attempts++) {
      controller.signal.throwIfAborted();
      const exited = await Promise.race([serverResult, Promise.resolve(null)]);
      if (exited) throw exited.error || new Error("O servidor de desenvolvimento foi encerrado.");
      try {
        const response = await fetch(`http://127.0.0.1:${options.port}/@vite/client`, { signal: AbortSignal.timeout(500) });
        if (response.ok) break;
      } catch { /* Vite may still be starting. */ }
      if (attempts === 99) throw new Error("O Vite não iniciou a tempo. Confira as mensagens acima.");
      await delay(200, undefined, { signal: controller.signal });
    }
    controller.signal.throwIfAborted();
    await command(process.execPath, [capacitorBin, "sync", "ios"], environment, children);
    controller.signal.throwIfAborted();
    if (options.open) await command(process.execPath, [capacitorBin, "open", "ios"], environment, children);
    console.log(`\nInterface: ${environment.BPS_LIVE_RELOAD_URL}
API: ${options.localApi ? `local em 127.0.0.1:${options.apiPort}, via proxy do Vite; configuração remota ignorada` : "HTTPS configurada em .env.student.local"}
No Xcode, selecione um iPhone/Simulator e pressione ▶ (Command + R).
Salve os arquivos React/CSS para atualizar a interface. Mantenha este terminal aberto.
Ctrl+C encerra a sessão. Projeto de distribuição ios/ preservado.\n`);
    const outcome = await serverResult;
    if (outcome.error && !controller.signal.aborted) throw outcome.error;
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    requestStop();
    // Give child processes time to exit before changing their generated config.
    if (serverResult) await serverResult;
    if (ownsSession) {
      try { await resetDevelopmentServer(); }
      finally { await unlink(lockPath); }
    }
    process.removeListener("SIGINT", requestStop);
    process.removeListener("SIGTERM", requestStop);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => { console.error(`\n${error.message}\n`); process.exitCode = 1; });
}
