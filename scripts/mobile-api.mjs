export async function checkMobileApi(baseUrl, request = fetch) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const get = async (path, options = {}) => {
    try {
      return await request(new URL(path, base), {
        redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(15_000), ...options,
      });
    } catch {
      throw new Error(`A API não respondeu em ${path}. Confira o deploy, HTTPS e as regras do proxy.`);
    }
  };
  await Promise.all([
    ...['accounts/ai-consent/', 'accounts/me/delete/', 'ai-study/content-reports/'].map(async (path) => {
      const response = await get(path, { headers: { Accept: 'application/json' } });
      if (response.status !== 401 || !response.headers.get('content-type')?.includes('application/json')) {
        throw new Error(`O backend publicado não está pronto: ${path} retornou HTTP ${response.status}. Publique esta versão da API antes de gerar o app assinado.`);
      }
    }),
    ...['capacitor://localhost', 'https://localhost'].map(async (origin) => {
      const response = await get('accounts/login/', { method: 'OPTIONS', headers: {
        Origin: origin, 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      } });
      const allowed = (response.headers.get('access-control-allow-headers') || '').toLowerCase().split(',').map((value) => value.trim());
      const methods = (response.headers.get('access-control-allow-methods') || '').toUpperCase().split(',').map((value) => value.trim());
      if (!response.ok || response.headers.get('access-control-allow-origin') !== origin ||
          !methods.includes('POST') || !allowed.includes('authorization') || !allowed.includes('content-type')) {
        throw new Error(`CORS não está pronto para ${origin}. Atualize o backend e permita OPTIONS, Authorization e Content-Type no proxy.`);
      }
    }),
  ]);
}
