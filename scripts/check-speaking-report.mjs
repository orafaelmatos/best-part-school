// Local browser check for student closure and the teacher's persisted report view.
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import ts from 'typescript';

const origin = process.env.SPEAKING_PREVIEW_URL || 'http://127.0.0.1:4173';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Use a local preview server.');
const artifacts = process.env.SPEAKING_PREVIEW_ARTIFACTS || '/private/tmp/speaking-phase-5';
await mkdir(artifacts, { recursive: true });
// Reuse the typed unit-test fixture without changing application/runtime dependencies.
const fixtureSource = await readFile(new URL('../src/test/speakingReport.ts', import.meta.url), 'utf8');
const fixtureJS = ts.transpileModule(fixtureSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { speakingReportFixture } = await import(`data:text/javascript;base64,${Buffer.from(fixtureJS).toString('base64')}`);
const report = speakingReportFixture();
const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.SPEAKING_BROWSER_PATH || (process.platform === 'darwin' && existsSync(systemChrome) ? systemChrome : chromium.executablePath());
const browser = await chromium.launch({ executablePath });
const results = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    for (const role of ['student', 'teacher']) {
      const context = await browser.newContext({ viewport });
      const user = { user_id: `preview-${role}`, email: `${role}@example.test`, name: role === 'teacher' ? 'Professora de teste' : 'Gabriel', role,
        exp: Math.floor(Date.now() / 1000) + 3600 };
      const token = [Buffer.from('{}').toString('base64url'), Buffer.from(JSON.stringify(user)).toString('base64url'), 'fixture'].join('.');
      await context.addInitScript(({ token, origin }) => {
        localStorage.setItem('token', token);
        window.__APP_CONFIG__ = { VITE_API_URL: `${origin}/api/`, VITE_MEDIA_BASE_URL: origin };
      }, { token, origin });
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let session = { id: 'preview', mode: 'speaking', title: 'Speaking — Aula de Jiu-Jitsu', title_source: 'auto', status: 'active', message_count: 1,
        guided_state: { enabled: true, stage: 'active', level: 'A1', expected_input: 'choice', speaking: { phase: 'FEEDBACK' } },
        messages: [{ id: 'closing', role: 'assistant', content_type: 'text', text: 'Terminamos a situação. Você pode encerrar ou continuar praticando.', metadata: {
          guided: true, expected_input: 'choice', choices: [{ id: 'end', value: 'finalize_session', action_type: 'session_control', label: 'Encerrar' }],
        } }] };
      const record = { id: 'report-1', session: 'preview', run_id: 'run-1', status: 'completed', report,
        created_at: report.generated_at, updated_at: report.generated_at, completed_at: report.generated_at };
      await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
        if (url.pathname.endsWith('/preview/message/')) {
          const payload = request.postDataJSON();
          if (payload.guided_action.value !== 'finalize_session') throw new Error('Unexpected action.');
          const assistant = { id: 'summary', role: 'assistant', content_type: 'text', text: 'Sessão encerrada.', metadata: {
            guided: true, speaking_report: report, expected_input: 'choice', choices: [{ id: 'new', value: 'new_scenario', action_type: 'session_control', label: 'Novo cenário' }],
          } };
          session = { ...session, status: 'completed', guided_state: { ...session.guided_state, stage: 'completed' }, messages: [...session.messages, assistant] };
          return json({ session, assistant_message: assistant });
        }
        if (url.pathname === '/api/ai-study/sessions/preview/') return json(session);
        if (url.pathname === '/api/ai-study/sessions/') return json([session]);
        if (url.pathname === '/api/ai-study/speaking-reports/') {
          if (url.searchParams.get('student') !== 'preview-student') throw new Error('Missing student scope.');
          return json({ count: 1, previous: null, next: null, results: [record] });
        }
        if (url.pathname.endsWith('/progress/overview/')) return json({ recommendation: null, speaking_sessions: { total: 1, completed: 1, recent: [record] } });
        if (url.pathname.endsWith('/recommendations/current/')) return json(null);
        if (url.pathname === `/api/accounts/users/${user.user_id}/`) return json(user);
        if (url.pathname === '/api/accounts/users/preview-student/') return json({ id: 'preview-student', name: 'Gabriel', role: 'student', email: 'student@example.test', level: 'A1' });
        if (url.pathname.endsWith('/sidebar-badges/')) return json({});
        return json([]);
      });
      if (role === 'student') {
        await page.goto(`${origin}/app/treinar-ia/conversa/preview`);
        await page.getByRole('button', { name: 'Encerrar', exact: true }).click();
        await expect(page.getByRole('region', { name: 'Resumo de Speaking' })).toBeVisible();
        await expect(page.getByRole('region', { name: 'Resposta por voz' })).toHaveCount(0);
        await page.reload();
      } else {
        await page.goto(`${origin}/app/alunos/preview-student/aulas`);
        await expect(page.getByText('1 cenário registrado · 1 encerrado')).toBeVisible();
        await page.getByText(/30\/10\/2026 · Aula de Jiu-Jitsu · A1 · Sessão encerrada/).click();
      }
      await expect(page.getByRole('region', { name: 'Resumo de Speaking' })).toBeVisible();
      await page.getByText('Frases utilizadas', { exact: false }).click();
      await expect(page.getByText('My name is Gabriel.', { exact: true })).toBeVisible();
      await page.getByText('Recomendações de revisão', { exact: false }).click();
      await expect(page.getByText('Retome este ponto com seu professor: Use My name is.', { exact: true })).toBeVisible();
      await page.getByRole('region', { name: 'Resumo de Speaking' }).screenshot({ path: `${artifacts}/${role}-${viewport.width}.png` });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`Horizontal overflow: ${role}, ${viewport.width}.`);
      if (errors.length) throw new Error(errors.join('\n'));
      results.push({ role, width: viewport.width, pageErrors: errors.length });
      await context.close();
    }
  }
  console.log(JSON.stringify({ results, artifacts }, null, 2));
} finally { await browser.close(); }
