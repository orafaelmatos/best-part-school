// Simultaneous interpretation with real browser media, synthetic microphone and local API fixtures.
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import ts from 'typescript';

const origin = process.env.INTERPRETER_PREVIEW_URL || 'http://127.0.0.1:4173';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Use a local preview server.');
const artifacts = process.env.INTERPRETER_PREVIEW_ARTIFACTS || '/private/tmp/interpreter-phase-2';
await mkdir(artifacts, { recursive: true });
const fixtureSource = await readFile(new URL('../src/test/interpreter.ts', import.meta.url), 'utf8');
const fixtureJS = ts.transpileModule(fixtureSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const fixtures = await import(`data:text/javascript;base64,${Buffer.from(fixtureJS).toString('base64')}`);
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: process.env.INTERPRETER_BROWSER_PATH || (existsSync(chrome) ? chrome : chromium.executablePath()),
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const samples = 16000 * 4;
const wave = Buffer.alloc(44 + samples * 2);
wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8); wave.writeUInt32LE(16, 16);
wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22); wave.writeUInt32LE(16000, 24); wave.writeUInt32LE(32000, 28);
wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write('data', 36); wave.writeUInt32LE(wave.length - 44, 40);
for (let i = 0; i < samples; i++) wave.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / 16000) * 3000), 44 + i * 2);

const parseMultipart = request => {
  const body = request.postDataBuffer(), boundary = request.headers()['content-type'].split('boundary=')[1];
  const values = {};
  let start = 0;
  while ((start = body.indexOf(Buffer.from(`--${boundary}\r\n`), start)) !== -1) {
    const headerEnd = body.indexOf('\r\n\r\n', start);
    const header = body.subarray(start, headerEnd).toString();
    const name = /name="([^"]+)"/.exec(header)?.[1];
    const end = body.indexOf(Buffer.from(`\r\n--${boundary}`), headerEnd + 4);
    if (name) values[name] = name === 'audio' ? body.subarray(headerEnd + 4, end) : body.subarray(headerEnd + 4, end).toString();
    if (name === 'audio') values.mime = /Content-Type: ([^\r\n]+)/i.exec(header)?.[1];
    start = end + 2;
  }
  return values;
};
const results = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 568 }].filter(v => !process.env.INTERPRETER_PREVIEW_WIDTH || v.width === Number(process.env.INTERPRETER_PREVIEW_WIDTH))) {
    const session = structuredClone(fixtures.interpreterSession);
    session.guided_state.interpreter.settings = { ...session.guided_state.interpreter.settings, interpretation_mode: 'simultaneous', direction: 'alternating', playback_speed: 1, segment_duration_seconds: 30 };
    session.messages[0].metadata.interpretation_turn.audio_url = null;
    let recorded, timing, answerCount = 0, failUpload = true;
    const pageErrors = [];
    for (const role of ['student', 'teacher']) {
      const context = await browser.newContext({ viewport, permissions: ['microphone'] });
      const user = { user_id: `preview-${role}`, name: 'Pessoa de teste', role, email: `${role}@example.test`, exp: Math.floor(Date.now() / 1000) + 3600 };
      const token = [Buffer.from('{}').toString('base64url'), Buffer.from(JSON.stringify(user)).toString('base64url'), 'fixture'].join('.');
      await context.addInitScript(({ token, origin }) => {
        localStorage.setItem('token', token);
        window.__APP_CONFIG__ = { VITE_API_URL: `${origin}/api/`, VITE_MEDIA_BASE_URL: origin };
        const ActualRecorder = window.MediaRecorder;
        window.MediaRecorder = class extends ActualRecorder { constructor(...args) { super(...args); window.__simRecorder = this; } };
        window.__micStreams = [];
        const actualGetMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (...args) => { const stream = await actualGetMedia(...args); window.__micStreams.push(stream); return stream; };
        const actualPlay = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
          if (window.__rejectPlayback && this.getAttribute('aria-label') === 'Áudio original da simultânea') { window.__rejectPlayback = false; return Promise.reject(new DOMException('blocked', 'NotAllowedError')); }
          return actualPlay.call(this);
        };
      }, { token, origin });
      const page = await context.newPage(); page.setDefaultTimeout(20000);
      page.on('pageerror', error => pageErrors.push(error.message));
      const checkWidth = async label => {
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) {
          await page.screenshot({ path: `${artifacts}/${viewport.width}-${role}-${label}-overflow.png`, fullPage: true });
          throw new Error(`Overflow ${viewport.width}px (${role}, ${label}).`);
        }
      };
      let rejectedId;
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
        if (url.pathname === '/api/fixture-source.wav') return route.fulfill({ contentType: 'audio/wav', body: wave });
        if (url.pathname === '/api/fixture-recording.webm') return route.fulfill({ contentType: recorded.mime, body: recorded.audio });
        if (url.pathname === '/api/ai-study/sessions/' && request.method() === 'POST') {
          const payload = request.postDataJSON();
          if (payload.interpreter_settings.interpretation_mode !== 'simultaneous' || payload.interpreter_settings.segment_duration_seconds !== 30 || payload.interpreter_settings.playback_speed !== 1) throw new Error('Simultaneous setup missing.');
          return json(session, 201);
        }
        if (url.pathname.endsWith('/interpreter/audio/')) {
          const id = request.postDataJSON().message_id;
          const message = session.messages.find(m => m.id === id);
          if (message) message.metadata.interpretation_turn.audio_url = `${origin}/api/fixture-source.wav`;
          return json({ audio_url: `${origin}/api/fixture-source.wav` });
        }
        if (url.pathname.endsWith('/interpreter/answer/')) {
          const payload = parseMultipart(request);
          if (!payload.mime?.includes('audio/webm') || payload.audio.length < 100) throw new Error('No actual browser audio.');
          timing = JSON.parse(payload.simultaneous_timing);
          if (!timing.source_completed || timing.segments.length < 2 || !timing.segments.some(s => s.playback_rate === 0.75)) throw new Error('Missing pause/rate timeline.');
          if (failUpload) { failUpload = false; rejectedId = payload.request_id; return json({ detail: 'Falha simulada. Sua gravação foi mantida para tentar novamente.' }, 503); }
          if (payload.request_id !== rejectedId) throw new Error('Upload retry changed the idempotency key.');
          recorded = payload; answerCount++;
          session.messages.push({ id: 'answer-1', role: 'user', text: 'Que bênção estar com vocês esta noite!', audio_url: `${origin}/api/fixture-recording.webm`, metadata: { interpreter_answer: { challenge_id: 'turn-1', response_mode: 'voice', simultaneous_timing: timing } } },
            { id: 'feedback-1', role: 'assistant', text: fixtures.interpreterFeedback.summary, metadata: { interpretation_feedback: fixtures.interpreterFeedback } });
          session.guided_state.interpreter.report = { interpreted_segments: 1, oral_segments: 1, simultaneous_segments: 1, meaning_score: 95, completeness_score: 100, naturalness_score: 95,
            preserved: [{ text: 'Bênção de estar com o público nesta noite.', evidence: 'Que bênção estar com vocês esta noite!', explanation: 'Mensagem preservada.', challenge_id: 'turn-1' }], omitted: [], altered: [], difficult_vocabulary: [], recommendations: [], difficult_segments: [] };
          return json(session);
        }
        if (url.pathname.endsWith('/interpreter/next/')) {
          const turn = structuredClone(fixtures.interpreterTurn); turn.id = 'turn-2';
          Object.assign(turn.metadata.interpretation_turn, { index: 1, step_index: 1, source_language: 'pt', target_language: 'en', speaker: 'Ana', audio_url: null });
          session.messages.push(turn); session.guided_state.interpreter.active_turn_id = turn.id; session.guided_state.interpreter.next_index = 2;
          return json(session);
        }
        if (url.pathname.endsWith('/interpreter/finish/')) { session.status = 'completed'; session.guided_state.interpreter.status = 'completed'; return json(session); }
        if (url.pathname === '/api/ai-study/sessions/session-v2/') return json(session);
        if (url.pathname === '/api/ai-study/sessions/') return json([session]);
        if (url.pathname === `/api/accounts/users/${user.user_id}/`) return json(user);
        if (url.pathname.endsWith('/progress/overview/')) return json({ recommendation: null });
        if (url.pathname.endsWith('/sidebar-badges/')) return json({});
        return json([]);
      });
      if (role === 'student') {
        await page.goto(`${origin}/app/interprete-ia`);
        await page.getByRole('button', { name: /Interpretação simultânea Avançado/ }).click();
        await page.getByLabel('Duração da fala simultânea').selectOption('30');
        await page.getByRole('button', { name: 'Alternar os dois idiomas' }).click();
        await checkWidth('setup');
        await page.screenshot({ path: `${artifacts}/${viewport.width}-setup.png`, fullPage: true });
        await page.getByRole('button', { name: 'Iniciar interpretação' }).click();
        await page.getByRole('button', { name: 'Preparar áudio', exact: true }).click();
        const start = page.getByRole('button', { name: 'Iniciar áudio e gravação' });
        await expect(start).toBeEnabled();
        await page.evaluate(() => { window.__rejectPlayback = true; });
        await start.click();
        await expect(page.getByRole('alert')).toContainText('O navegador não iniciou o áudio original');
        await expect.poll(() => page.evaluate(() => window.__micStreams.every(s => s.getTracks().every(t => t.readyState === 'ended')))).toBe(true);
        await start.click();
        const original = page.getByLabel('Áudio original da simultânea', { exact: true });
        await expect.poll(() => original.evaluate(audio => !audio.paused && window.__simRecorder.state === 'recording')).toBe(true);
        await expect(page.getByLabel('Tempo da simultânea')).toHaveText('0:01');
        await expect(page.getByRole('button', { name: 'Encerrar sessão e ver relatório' })).toBeDisabled();
        await page.getByLabel('Velocidade da simultânea').selectOption('0.9');
        await expect.poll(() => original.evaluate(audio => audio.playbackRate)).toBe(0.9);
        await page.waitForTimeout(300);
        await page.getByRole('button', { name: 'Pausar os dois' }).click();
        const pausedPosition = await original.evaluate(audio => audio.currentTime);
        await expect.poll(() => page.evaluate(() => window.__simRecorder.state)).toBe('paused');
        await page.waitForTimeout(500);
        expect(Math.abs(await original.evaluate(audio => audio.currentTime) - pausedPosition)).toBeLessThan(0.05);
        await page.getByLabel('Velocidade da simultânea').selectOption('0.75');
        await page.getByRole('button', { name: 'Retomar os dois' }).click();
        await expect.poll(() => original.evaluate(audio => !audio.paused && window.__simRecorder.state === 'recording')).toBe(true);
        await checkWidth('recording');
        await page.screenshot({ path: `${artifacts}/${viewport.width}-recording.png`, fullPage: true });
        await page.getByRole('button', { name: 'Concluir simultânea' }).click();
        await expect(page.getByRole('region', { name: 'Comparação dos dois áudios' })).toBeVisible();
        if (answerCount) throw new Error('Audio uploaded without confirmation.');
        await page.getByRole('button', { name: 'Ouvir os dois juntos', exact: true }).click();
        await expect.poll(() => page.getByLabel('Original na comparação', { exact: true }).evaluate(audio => !audio.paused)).toBe(true);
        await expect.poll(() => page.getByLabel('Interpretação na comparação', { exact: true }).evaluate(audio => !audio.paused)).toBe(true);
        await page.getByRole('button', { name: 'Pausar comparação' }).click();
        await page.getByRole('button', { name: 'Enviar interpretação', exact: true }).click();
        await expect(page.getByRole('alert')).toContainText('Sua gravação foi mantida');
        await expect(page.getByRole('region', { name: 'Comparação dos dois áudios' })).toBeVisible();
        await page.getByRole('button', { name: 'Enviar interpretação', exact: true }).click();
        await expect(page.getByRole('region', { name: 'Feedback da interpretação' })).toBeVisible();
        await page.getByRole('button', { name: 'Próxima fala' }).click();
        await expect(page.getByText('Sua vez! Interprete para o inglês.')).toBeVisible();
        await page.getByRole('button', { name: 'Encerrar sessão e ver relatório' }).click();
        await expect(page.getByRole('region', { name: 'Relatório de interpretação' })).toContainText('1 trecho por interpretação simultânea');
        await page.reload();
        await expect(page.getByRole('region', { name: 'Relatório de interpretação' })).toBeVisible();
        await page.getByText('Histórico das interpretações', { exact: true }).click();
      } else {
        await page.goto(`${origin}/app/interprete-ia/conversa/session-v2`);
        await expect(page.getByText(/Visualização do professor/)).toBeVisible();
        await page.getByText('Histórico das interpretações', { exact: true }).click();
        await expect(page.getByRole('region', { name: 'Comparação dos dois áudios' })).toBeVisible();
        await page.getByRole('button', { name: 'Ouvir os dois juntos', exact: true }).click();
        await expect.poll(() => page.getByLabel('Interpretação na comparação', { exact: true }).evaluate(audio => !audio.paused)).toBe(true);
        await page.getByRole('button', { name: 'Pausar comparação' }).click();
        await expect(page.getByRole('button', { name: 'Enviar interpretação' })).toHaveCount(0);
      }
      await checkWidth('review');
      await page.screenshot({ path: `${artifacts}/${viewport.width}-${role}-review.png`, fullPage: true });
      await context.close();
    }
    if (pageErrors.length) throw new Error(pageErrors.join('\n'));
    await writeFile(`${artifacts}/${viewport.width}-timing.json`, JSON.stringify(timing, null, 2));
    results.push({ width: viewport.width, bytes: recorded.audio.length, timelineSegments: timing.segments.length, simultaneousPlaybackAndRecording: true, uploadRetries: 'idempotent', teacherReplay: 'passed' });
  }
  console.log(JSON.stringify({ artifacts, results }, null, 2));
} finally { await browser.close(); }
// The standalone smoke test owns this process; no test-runner workers remain.
process.exit(0);
