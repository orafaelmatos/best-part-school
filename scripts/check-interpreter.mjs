// Local browser check. Uses API fixtures, synthetic audio and Chromium's fake microphone.
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import ts from 'typescript';

const origin = process.env.INTERPRETER_PREVIEW_URL || 'http://127.0.0.1:4173';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Use a local preview server.');
const artifacts = process.env.INTERPRETER_PREVIEW_ARTIFACTS || '/private/tmp/interpreter-phase-1';
await mkdir(artifacts, { recursive: true });
const source = await readFile(new URL('../src/test/interpreter.ts', import.meta.url), 'utf8');
const fixtureJS = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const fixtures = await import(`data:text/javascript;base64,${Buffer.from(fixtureJS).toString('base64')}`);
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: process.env.INTERPRETER_BROWSER_PATH || (existsSync(chrome) ? chrome : chromium.executablePath()),
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const sampleCount = 16000;
const wave = Buffer.alloc(44 + sampleCount * 2);
wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8); wave.writeUInt32LE(16, 16);
wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22); wave.writeUInt32LE(16000, 24); wave.writeUInt32LE(32000, 28);
wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write('data', 36); wave.writeUInt32LE(wave.length - 44, 40);
for (let i = 0; i < sampleCount; i++) wave.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / 16000) * 3000), 44 + i * 2);
const results = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 568 }].filter(v => !process.env.INTERPRETER_PREVIEW_WIDTH || v.width === Number(process.env.INTERPRETER_PREVIEW_WIDTH))) {
    let session = structuredClone(fixtures.interpreterSession);
    let audioBytes;
    let audioMime;
    let answers = 0;
    const pageErrors = [];
    for (const role of ['student', 'teacher']) {
      const context = await browser.newContext({ viewport, permissions: ['microphone'] });
      const user = { user_id: `preview-${role}`, name: role === 'student' ? 'Aluno de teste' : 'Professora de teste', role, email: `${role}@example.test`, exp: Math.floor(Date.now() / 1000) + 3600 };
      const token = [Buffer.from('{}').toString('base64url'), Buffer.from(JSON.stringify(user)).toString('base64url'), 'fixture'].join('.');
      await context.addInitScript(({ token, origin }) => {
        localStorage.setItem('token', token);
        window.__APP_CONFIG__ = { VITE_API_URL: `${origin}/api/`, VITE_MEDIA_BASE_URL: origin };
      }, { token, origin });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on('pageerror', (error) => pageErrors.push(error.message));
      const checkWidth = async stage => {
        const overflowing = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        if (overflowing) {
          await page.screenshot({ path: `${artifacts}/${viewport.width}-${role}-${stage}-overflow.png`, fullPage: true });
          throw new Error(`Horizontal overflow at ${viewport.width}px (${role}, ${stage}).`);
        }
      };
      await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
        if (url.pathname === '/api/fixture-source.wav') return route.fulfill({ contentType: 'audio/wav', body: wave });
        if (url.pathname === '/api/fixture-recording.webm') return route.fulfill({ contentType: audioMime, body: audioBytes });
        if (url.pathname === '/api/ai-study/sessions/' && request.method() === 'POST') {
          const payload = request.postDataJSON();
          if (payload.interpreter_settings.direction !== 'pt_en' || !payload.interpreter_settings.prepare_vocabulary) throw new Error('Setup settings were not sent.');
          session.guided_state.interpreter.settings = payload.interpreter_settings;
          session.guided_state.interpreter.status = 'ready';
          session.guided_state.interpreter.active_turn_id = null;
          session.messages = [];
          return json(session, 201);
        }
        if (url.pathname.endsWith('/interpreter/next/')) {
          const turn = structuredClone(fixtures.interpreterTurn);
          turn.metadata.interpretation_turn = { ...turn.metadata.interpretation_turn, speaker: 'Ana', source_language: 'pt', target_language: 'en',
            transcript: 'É uma bênção estar aqui com vocês nesta noite.', suggested_interpretation: 'It is a blessing to be here with you tonight.', audio_url: null };
          turn.text = turn.metadata.interpretation_turn.transcript;
          session.messages = [turn];
          session.guided_state.interpreter.status = 'active';
          session.guided_state.interpreter.active_turn_id = turn.id;
          return json(session);
        }
        if (url.pathname.endsWith('/interpreter/audio/')) return json({ audio_url: `${origin}/api/fixture-source.wav` });
        if (url.pathname.endsWith('/interpreter/answer/')) {
          const body = request.postDataBuffer();
          const start = body.indexOf('name="audio"');
          const headerEnd = body.indexOf('\r\n\r\n', start);
          const header = body.subarray(start, headerEnd).toString();
          audioMime = /Content-Type: ([^\r\n]+)/i.exec(header)?.[1];
          const boundary = request.headers()['content-type'].split('boundary=')[1];
          const end = body.indexOf(Buffer.from(`\r\n--${boundary}`), headerEnd + 4);
          audioBytes = body.subarray(headerEnd + 4, end);
          if (!audioMime?.includes('audio/webm') || audioBytes.length < 100) throw new Error('Missing encoded browser recording.');
          answers++;
          const feedback = structuredClone(fixtures.interpreterFeedback);
          const answer = { id: 'answer-1', role: 'user', text: 'It is a blessing to join you this evening!', audio_url: `${origin}/api/fixture-recording.webm`, metadata: { interpreter_answer: { challenge_id: 'turn-1', response_mode: 'voice' } } };
          session.messages.push(answer, { id: 'feedback-1', role: 'assistant', text: feedback.summary, metadata: { interpretation_feedback: feedback } });
          session.guided_state.interpreter.report = { interpreted_segments: 1, oral_segments: 1, meaning_score: 95, completeness_score: 100, naturalness_score: 95,
            preserved: [{ text: 'Bênção de estar com o público nesta noite.', evidence: answer.text, explanation: 'O significado foi mantido.', challenge_id: 'turn-1' }],
            omitted: [], altered: [], difficult_vocabulary: [], recommendations: [], difficult_segments: [] };
          return json(session);
        }
        if (url.pathname.endsWith('/interpreter/finish/')) {
          session.status = 'completed'; session.guided_state.interpreter.status = 'completed'; return json(session);
        }
        if (url.pathname === '/api/ai-study/sessions/session-v2/') return json(session);
        if (url.pathname === '/api/ai-study/sessions/') {
          if (role === 'teacher' && url.searchParams.has('student') && url.searchParams.get('student') !== 'preview-student') throw new Error('Missing teacher student scope.');
          return json(session.messages.length ? [session] : []);
        }
        if (url.pathname === '/api/accounts/users/preview-student/') return json({ ...user, id: 'preview-student', name: 'Aluno de teste', role: 'student', level: 'A2' });
        if (url.pathname === `/api/accounts/users/${user.user_id}/`) return json(user);
        if (url.pathname.endsWith('/progress/overview/')) return json({ recommendation: null, speaking_sessions: { total: 0, completed: 0 } });
        if (url.pathname.endsWith('/speaking-reports/')) return json({ count: 0, results: [], next: null, previous: null });
        if (url.pathname.endsWith('/recommendations/current/')) return json(null);
        if (url.pathname.endsWith('/sidebar-badges/')) return json({});
        return json([]);
      });
      if (role === 'student') {
        await page.goto(`${origin}/app/interprete-ia`);
        await expect(page.getByRole('heading', { name: 'Dê voz à mensagem em outro idioma' })).toBeVisible();
        await checkWidth('setup');
        await page.screenshot({ path: `${artifacts}/${viewport.width}-setup.png`, fullPage: true });
        await page.getByRole('button', { name: 'Português → Inglês', exact: true }).click();
        await page.getByRole('checkbox', { name: /Preparar vocabulário/ }).check();
        await page.getByRole('button', { name: 'Iniciar interpretação' }).click();
        await expect(page.getByRole('heading', { name: 'Preparar vocabulário' })).toBeVisible();
        await checkWidth('vocabulary');
        await page.getByRole('button', { name: 'Começar a interpretar' }).click();
        await expect(page.getByText('Sua vez! Interprete para o inglês.')).toBeVisible();
        await checkWidth('active');
        await page.getByRole('button', { name: 'Ouvir fala original', exact: true }).click();
        const original = page.getByLabel('Ouvir fala original', { exact: true });
        await original.evaluate(audio => audio.play());
        await expect(page.getByRole('button', { name: 'Gravar interpretação', exact: true })).toBeEnabled();
        await page.getByRole('button', { name: 'Gravar interpretação', exact: true }).click();
        await expect(page.getByRole('status').filter({ hasText: 'Gravando sua resposta' })).toBeVisible();
        await expect(page.getByLabel('Duração da gravação')).toHaveText('0:01');
        await page.getByRole('button', { name: 'Concluir gravação' }).click();
        await expect(page.getByLabel('Ouvir minha interpretação', { exact: true })).toBeVisible();
        await checkWidth('recorded');
        if (answers) throw new Error('Recording was sent before learner confirmation.');
        await page.getByLabel('Ouvir minha interpretação', { exact: true }).evaluate(audio => audio.play());
        await page.getByRole('button', { name: 'Enviar interpretação', exact: true }).click();
        await expect(page.getByRole('region', { name: 'Feedback da interpretação' })).toBeVisible();
        await page.getByLabel('Ouvir minha interpretação enviada').evaluate(audio => audio.play());
        await page.getByRole('button', { name: 'Ouvir interpretação sugerida em inglês', exact: true }).click();
        await page.getByRole('button', { name: 'Encerrar sessão e ver relatório' }).click();
        await expect(page.getByRole('region', { name: 'Relatório de interpretação' })).toBeVisible();
        await page.reload();
        await expect(page.getByRole('region', { name: 'Relatório de interpretação' })).toContainText('1 trecho avaliado');
      } else {
        await page.goto(`${origin}/app/alunos/preview-student/aulas`);
        const section = page.getByRole('region', { name: 'Acompanhamento de interpretação' });
        await expect(section).toBeVisible();
        await section.getByText(/Intérprete IA — Pregação/).click();
        await expect(section.getByRole('region', { name: 'Relatório de interpretação' })).toBeVisible();
        await section.getByRole('link', { name: 'Ver falas e gravações' }).click();
        await expect(page.getByText(/Visualização do professor/)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Encerrar sessão e ver relatório' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Gravar interpretação' })).toHaveCount(0);
      }
      const overflows = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      await page.screenshot({ path: `${artifacts}/${viewport.width}-${role}-report.png`, fullPage: true });
      if (overflows) {
        console.log(await page.evaluate(() => [...document.querySelectorAll('main *')].filter(el => el.getBoundingClientRect().right > innerWidth).map(el => ({ tag: el.tagName, text: el.textContent?.slice(0, 100), width: el.getBoundingClientRect().width })).slice(-15)));
        throw new Error(`Horizontal overflow at ${viewport.width}px (${role}).`);
      }
      await context.close();
    }
    if (pageErrors.length) throw new Error(pageErrors.join('\n'));
    results.push({ width: viewport.width, syntheticMicrophone: true, actualRecordedBytes: audioBytes.length, studentAndTeacher: 'passed' });
  }
  console.log(JSON.stringify({ artifacts, results }, null, 2));
} finally { await browser.close(); }
