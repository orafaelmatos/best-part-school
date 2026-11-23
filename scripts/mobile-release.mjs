import { resolve } from "node:path";
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadEnv } from 'vite';
import { checkMobileApi } from './mobile-api.mjs';
const action = process.argv[2] || 'check';
const env = { ...loadEnv('student', process.cwd(), ''), ...process.env };
const fail = (message) => { throw new Error(message); };
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', env: { ...env, NODE_ENV: 'production' }, ...options });
  if (result.status !== 0) fail(`${command} falhou. Corrija a etapa antes de continuar.`);
};
if (!['check', 'api', 'prepare', 'android', 'ios'].includes(action)) fail('Ação inválida: use check, api, prepare, android ou ios.');
for (const key of ['VITE_API_URL', 'VITE_MEDIA_BASE_URL', 'VITE_PUBLIC_SITE_URL']) {
  let url;
  try { url = new URL(env[key]); } catch { fail(`Configure ${key} em .env.student.local.`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      /(^localhost$|\.local$|\.test$|\.invalid$|example\.|seu-dominio|127\.0\.0\.1)/i.test(url.hostname)) fail(`${key} precisa usar o domínio HTTPS real do release.`);
}
if (env.VITE_LOCAL_API === '1' || env.BPS_MOBILE_DEV === '1' || env.BPS_LIVE_RELOAD_URL) fail('Remova a API local e o live reload antes do release.');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.VITE_SUPPORT_EMAIL || '')) fail('Configure VITE_SUPPORT_EMAIL.');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const android = readFileSync('android/app/build.gradle', 'utf8');
const ios = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
const version = android.match(/versionName "([^"]+)"/)?.[1];
const build = android.match(/versionCode (\d+)/)?.[1];
if (!/^\d+\.\d+\.\d+$/.test(pkg.version) || version !== pkg.version || !ios.includes(`MARKETING_VERSION = ${pkg.version};`) || !ios.includes(`CURRENT_PROJECT_VERSION = ${build};`)) fail('Alinhe as versões: npm run mobile:version -- 1.0.0 1');
if (!existsSync('assets/mobile/icon.png')) fail('Gere os ícones da escola antes do release.');
if (action === 'android') {
  for (const key of ['BPS_ANDROID_KEYSTORE_PATH', 'BPS_ANDROID_KEYSTORE_PASSWORD', 'BPS_ANDROID_KEY_ALIAS', 'BPS_ANDROID_KEY_PASSWORD']) {
    if (!env[key]) fail(`Configure ${key} para gerar um AAB assinado.`);
  }
  env.BPS_ANDROID_KEYSTORE_PATH = resolve(env.BPS_ANDROID_KEYSTORE_PATH);
  if (!existsSync(env.BPS_ANDROID_KEYSTORE_PATH)) fail('O arquivo da chave de upload não foi encontrado.');
}
if (action === 'ios' && !/^[A-Z0-9]{10}$/.test(env.BPS_APPLE_TEAM_ID || '')) fail('Configure BPS_APPLE_TEAM_ID com o Team ID da sua conta Apple Developer.');
console.log(`Configuração do app ${pkg.version} (${build}) validada.`);
console.log(`API: ${env.VITE_API_URL}`);
if (action === 'check') process.exit(0);
if (['api', 'android', 'ios'].includes(action)) {
  await checkMobileApi(env.VITE_API_URL);
  console.log('Endpoints de privacidade e CORS da API publicada validados, sem autenticação.');
  if (action === 'api') process.exit(0);
}
run('npm', ['run', 'lint']);
run('npm', ['run', 'check:types']);
run('npm', ['run', 'test:mobile-scripts']);
run('npm', ['test'], { env: { ...env, NODE_ENV: 'test' } });
run('npm', ['run', 'build:student']);
run('node_modules/.bin/cap', ['sync']);
for (const path of ['android/app/src/main/assets/capacitor.config.json', 'ios/App/App/capacitor.config.json']) {
  const config = JSON.parse(readFileSync(path, 'utf8'));
  if (config.server?.url || config.server?.cleartext) fail('O pacote gerado contém configuração de desenvolvimento.');
}
if (action === 'android') run('./gradlew', ['bundleRelease'], { cwd: 'android' });
if (action === 'ios') {
  mkdirSync('.release/mobile', { recursive: true });
  run('xcodebuild', ['-project', 'ios/App/App.xcodeproj', '-scheme', 'App', '-configuration', 'Release', '-destination', 'generic/platform=iOS', '-archivePath', '.release/mobile/BestPartSchool.xcarchive', '-allowProvisioningUpdates', `DEVELOPMENT_TEAM=${env.BPS_APPLE_TEAM_ID}`, 'archive']);
}
