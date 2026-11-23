// Local browser validation with API fixtures and a synthetic microphone.
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import ts from 'typescript';

const origin = process.env.SPEAKING_PREVIEW_URL || 'http://127.0.0.1:4173';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Use a local preview server.');
const artifacts = process.env.SPEAKING_PREVIEW_ARTIFACTS || '/private/tmp/speaking-feedback';
await mkdir(artifacts, { recursive: true });
// Reuse the unit-test fixture without loading application modules.
const fixtureCode = ts.transpileModule(await readFile(new URL('../src/test/speakingFeedback.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { speakingFeedbackFixture } = await import(`data:text/javascript;base64,${Buffer.from(fixtureCode).toString('base64')}`);
const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: process.env.SPEAKING_BROWSER_PATH || (existsSync(systemChrome) ? systemChrome : chromium.executablePath()),
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const user = { user_id: 'preview-student', role: 'student', level: 'A1', name: 'Aluno de teste', exp: Math.floor(Date.now() / 1000) + 3600 };
const token = [Buffer.from('{}').toString('base64url'), Buffer.from(JSON.stringify(user)).toString('base64url'), 'fixture'].join('.');
const wave = Buffer.alloc(44 + 32_000);
wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8); wave.writeUInt32LE(16, 16);
wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22); wave.writeUInt32LE(16_000, 24); wave.writeUInt32LE(32_000, 28);
wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write('data', 36); wave.writeUInt32LE(wave.length - 44, 40);
for (let i = 0; i < 16_000; i++) wave.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / 16_000) * 3000), 44 + i * 2);
const results = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    const context = await browser.newContext({ viewport, permissions: ['microphone'] });
    await context.addInitScript(({ token, origin }) => {
      localStorage.setItem('token', token);
      window.__APP_CONFIG__ = { VITE_API_URL: `${origin}/api/`, VITE_MEDIA_BASE_URL: origin };
    }, { token, origin });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const feedback = speakingFeedbackFixture();
    feedback.audio_url = '/api/original.wav';
    const metadata = { guided: true, expected_input: 'audio_or_text', speaking_prompt_id: 'a'.repeat(64), speaking_level: 'A1', pedagogical_phase: 'SIMULATE',
      speaking_turn: { feedback: '', instruction: '', demonstration: '', demonstration_translation: '', question: 'Sure! Anything else?',
        question_translation: 'Claro! Mais alguma coisa?', response_starter: '', response_starter_translation: '' },
      choices: [{ id: 'continue', value: 'continue', label: 'Continuar', action_type: 'simulation_help' }] };
    let session = { id: 'preview', mode: 'speaking', title: 'Speaking — Café', status: 'active', message_count: 1,
      guided_state: { enabled: true, stage: 'active', level: 'A1', expected_input: 'audio_or_text', current_task: 'Sure! Anything else?',
        speaking: { phase: 'SIMULATE', step_index: 1 } },
      messages: [{ id: 'turn-feedback', role: 'assistant', content_type: 'text', text: 'Sure! Anything else?', metadata, feedback_detail: feedback }] };
    let ttsFails = true;
    let uploads = 0;
    const ttsTexts = [];
    await page.route('**/*', async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname.endsWith('.wav')) return route.fulfill({ contentType: 'audio/wav', body: wave });
      if (url.pathname.endsWith('/tts/')) {
        if (ttsFails) return json({ detail: 'Tente novamente.' }, 503);
        const options = request.postDataJSON();
        const text = options.chunk_index === undefined ? feedback.natural_sentence : feedback.learning_feedback.chunks[options.chunk_index];
        ttsTexts.push(text);
        return json({ text, audio_url: `/api/suggested-${ttsTexts.length}.wav` });
      }
      if (url.pathname.endsWith('/preview/audio/')) {
        const body = request.postDataBuffer();
        if (!body.toString().includes('name="retry_feedback_id"\r\n\r\noral-feedback')) throw new Error('Missing explicit repetition target.');
        if (body.length < 1000) throw new Error('Missing encoded browser recording.');
        uploads++;
        const repeated = { ...feedback, id: 'repeat-feedback', transcript: feedback.natural_sentence, learning_feedback: { ...feedback.learning_feedback,
          previous_feedback_id: feedback.id, practice_target: feedback.natural_sentence, comparison: 'Você evitou a repetição de with nesta tentativa.' } };
        const assistant = { ...session.messages[0], id: 'repeat-result', feedback_detail: repeated };
        const userMessage = { id: 'repeat-recording', role: 'user', content_type: 'audio', text: repeated.transcript, audio_url: '/api/new-original.wav' };
        session = { ...session, messages: [...session.messages, userMessage, assistant] };
        return json({ session, feedback: repeated, user_message: userMessage, assistant_message: assistant }, 201);
      }
      if (url.pathname === '/api/ai-study/sessions/') return json([session]);
      if (url.pathname === '/api/ai-study/sessions/preview/') return json(session);
      if (url.pathname === '/api/accounts/users/preview-student/') return json(user);
      if (url.pathname.endsWith('/progress/overview/')) return json({ recommendation: null });
      if (url.pathname.endsWith('/sidebar-badges/')) return json({});
      return json([]);
    });
    await page.goto(`${origin}/app/treinar-ia/conversa/preview`);
    const card = page.getByRole('region', { name: 'Feedback de Speaking' }).last();
    await expect(card).toBeVisible();
    await expect(card.getByText('Ver mais detalhes').locator('..')).not.toHaveAttribute('open');
    await card.getByText('Ver tradução', { exact: true }).click();
    await expect(card.getByText(feedback.learning_feedback.suggested_translation, { exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Ouvir pronúncia', exact: true }).click();
    await expect(card.getByRole('alert')).toContainText('Tente novamente');
    ttsFails = false;
    await card.getByRole('button', { name: 'Ouvir pronúncia', exact: true }).click();
    const audio = card.getByLabel(`Áudio sugerido: ${feedback.natural_sentence}`, { exact: true });
    await expect(audio).toHaveAttribute('src', /suggested-1\.wav$/);
    await card.getByRole('combobox', { name: 'Velocidade da pronúncia sugerida' }).selectOption('0.75');
    await expect.poll(() => audio.evaluate((element) => element.playbackRate)).toBe(0.75);
    await card.getByRole('button', { name: 'Ouvir novamente', exact: true }).click();
    await card.getByRole('button', { name: 'Praticar por partes' }).click();
    const part = card.getByText('Etapa 1', { exact: true }).locator('..');
    await part.getByRole('button', { name: 'Ouvir pronúncia', exact: true }).click();
    await expect(part.locator('audio')).toHaveAttribute('src', /suggested-2\.wav$/);
    await part.getByRole('button', { name: 'Repetir trecho 1' }).click();
    await expect(page.getByText('Repita o trecho 1', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Voltar à conversa' }).click();
    await card.getByRole('button', { name: 'Tentar pronunciar', exact: true }).click();
    await page.getByRole('button', { name: 'Gravar resposta', exact: true }).click();
    await expect(page.getByLabel('Duração da gravação')).toHaveText('0:02');
    await page.getByRole('button', { name: 'Enviar áudio', exact: true }).click();
    await expect(page.getByLabel('Comparação com a tentativa anterior')).toContainText('Você evitou');
    await expect(page.getByText('Sure! Anything else?', { exact: true }).last()).toBeAttached();
    await card.getByText('Ver mais detalhes', { exact: true }).click();
    await expect(card.getByText('Pronúncia · Não avaliada')).toBeVisible();
    await page.screenshot({ path: `${artifacts}/${viewport.width}-feedback.png`, fullPage: true });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`Horizontal overflow at ${viewport.width}px.`);
    if (errors.length) throw new Error(errors.join('\n'));
    results.push({ width: viewport.width, uploads, ttsTexts, pageErrors: errors.length });
    await context.close();
  }
  console.log(JSON.stringify({ results, artifacts }, null, 2));
} finally { await browser.close(); }
