type BuildEnvironment = Record<string, string | undefined>;

export function requireHttpsUrl(value: string | undefined, name: string): URL {
  if (!value?.trim()) throw new Error(`${name} precisa ser configurada para gerar o app do aluno.`);
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${name} precisa ser uma URL HTTPS absoluta.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} precisa ser uma URL HTTPS sem credenciais, query ou fragmento.`);
  }
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error(`${name} deve apontar para um servidor acessível pelo aparelho, não localhost.`);
  }
  return url;
}

export function validateStudentBuildConfig(env: BuildEnvironment): void {
  if (env.VITE_LOCAL_API === "1") throw new Error("A API local funciona somente no live reload. Remova VITE_LOCAL_API para gerar uma versão empacotada.");
  requireHttpsUrl(env.VITE_API_URL, "VITE_API_URL");
  if (env.VITE_MEDIA_BASE_URL) requireHttpsUrl(env.VITE_MEDIA_BASE_URL, "VITE_MEDIA_BASE_URL");
}
