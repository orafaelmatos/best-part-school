// Browser smoke test with API fixtures and Chromium's synthetic microphone.
// Start Vite locally first. No real provider, login, or microphone is used.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const origin = process.env.SPEAKING_PREVIEW_URL || 'http://127.0.0.1:4173';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Use a local preview server.');
const artifacts = process.env.SPEAKING_PREVIEW_ARTIFACTS || '/private/tmp/speaking-phase-4';
await mkdir(artifacts, { recursive: true });
const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.SPEAKING_BROWSER_PATH || (process.platform === 'darwin' && existsSync(systemChrome) ? systemChrome : chromium.executablePath());
const browser = await chromium.launch({ executablePath, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const user = { user_id: 'preview-student', email: 'preview@example.test', name: 'Aluno de teste', role: 'student', level: 'A1', exp: Math.floor(Date.now() / 1000) + 3600 };
const token = [Buffer.from('{}').toString('base64url'), Buffer.from(JSON.stringify(user)).toString('base64url'), 'fixture'].join('.');
const vocabulary = { expression: 'My name is', translation: 'Meu nome é', example: 'My name is Ana.', example_translation: 'Meu nome é Ana.' };
const makeSession = (phase = 'SIMULATE', question = "What's your name?", index = 0) => {
  const content = { feedback: phase === 'FEEDBACK' ? 'Boa! Terminamos esta situação. Você pode revisar as frases ou escolher outro desafio.' : index ? 'Boa! Você conseguiu se apresentar.' : '', instruction: 'Vamos conversar com o professor da academia.',
    demonstration: phase === 'PRACTICE' ? vocabulary.example : '', demonstration_translation: vocabulary.example_translation,
    question: phase === 'FEEDBACK' ? '' : question, question_translation: 'Qual é seu nome?',
    response_starter: phase === 'SIMULATE' ? 'My name is...' : '', response_starter_translation: 'Meu nome é...' };
  const state = { enabled: true, stage: 'active', level: 'A1', current_task: question,
    expected_input: ['LEARN', 'FEEDBACK'].includes(phase) ? 'choice' : 'audio_or_text',
    speaking: { version: 1, phase, situation_id: 'academy', step_index: index, completed_phases: [],
      plan: { situations: [{ id: 'academy', label: 'Conhecer o professor', context: 'Você chegou à academia para sua primeira aula de Jiu-Jitsu e o professor recebe você.', ai_role: 'o professor', student_role: 'um aluno novo', objective: 'conhecer o professor e começar o treino.', sequence: [], vocabulary: [vocabulary] }] } } };
  const metadata = { guided: true, expected_input: state.expected_input, speaking_prompt_id: String(index).repeat(64), speaking_level: 'A1', pedagogical_phase: phase,
    choices: [{ id: 'continue', value: 'continue', label: 'Continuar', action_type: 'simulation_help' }] };
  if (phase === 'LEARN') metadata.speaking_activity = { step: 'WORD', item_index: 0, item: vocabulary, total_items: 2,
    completed_count: 0, review_count: 0, feedback: '', hint: '', task: null, next: '', assessment_source: null, attempts: 0, max_attempts: 3, show_translations: true };
  else metadata.speaking_turn = content;
  if (phase === 'SIMULATE') metadata.speaking_simulation = { question, step_index: index, situation_id: 'academy', support_level: 'full' };
  if (phase === 'SIMULATE') metadata.choices = [
    ['continue', 'Continuar'], ['not_understood', 'Não entendi'], ['hint', 'Me dê uma dica'], ['translate', 'Ver tradução'],
    ['examples', 'Ver exemplos'], ['vocabulary', 'Aprender vocabulário'], ['grammar', 'Explicar gramática'], ['new_challenge', 'Novo desafio'],
  ].map(([value, label]) => ({ id: value, value, label, action_type: 'simulation_help' }));
  if (index) metadata.assessment_source = 'transcript';
  return { id: 'preview', mode: 'speaking', title: 'Speaking — Aula de Jiu-Jitsu', title_source: 'auto', status: 'active', is_pinned: false,
    message_count: 1, guided_state: state, context_lessons: [], messages: [{ id: `turn-${phase}-${index}`, role: 'assistant', content_type: 'text', text: phase === 'LEARN' ? 'Boa! Vamos aprender uma expressão de cada vez.' : question, metadata }] };
};
const sampleCount = 16_000 * 5;
const wave = Buffer.alloc(44 + sampleCount * 2);
wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8); wave.writeUInt32LE(16, 16);
wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22); wave.writeUInt32LE(16_000, 24); wave.writeUInt32LE(32_000, 28);
wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write('data', 36); wave.writeUInt32LE(wave.length - 44, 40);
for (let i = 0; i < sampleCount; i++) wave.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / 16_000) * 3000), 44 + i * 2);
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
    let session = makeSession();
    let ttsFails = true;
    let recorded = null;
    let recordingType = '';
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname === '/api/fixture-tone.wav') return route.fulfill({ contentType: 'audio/wav', body: wave });
      if (url.pathname === '/api/fixture-recording.webm') return route.fulfill({ contentType: recordingType, body: recorded });
      if (url.pathname.endsWith('/utterance-audio/') || url.pathname.endsWith('/simulation-audio/')) return ttsFails ? json({ detail: 'Áudio indisponível; continue pelo texto.' }, 503) : json({ audio_url: `${origin}/api/fixture-tone.wav` });
      if (url.pathname.endsWith('/preview/audio/')) {
        const body = request.postDataBuffer();
        const headerEnd = body.indexOf('\r\n\r\n');
        const header = body.subarray(0, headerEnd).toString();
        recordingType = /Content-Type: ([^\r\n]+)/i.exec(header)?.[1];
        const boundary = request.headers()['content-type'].split('boundary=')[1];
        const end = body.indexOf(Buffer.from(`\r\n--${boundary}`), headerEnd + 4);
        recorded = body.subarray(headerEnd + 4, end);
        if (!recordingType?.includes('audio/webm') || recorded.length < 100) throw new Error('Missing real encoded browser recording.');
        const next = makeSession('SIMULATE', 'Is this your first class?', 1);
        const userMessage = { id: 'student-audio', role: 'user', content_type: 'audio', text: 'My name is Gabriel.', audio_url: `${origin}/api/fixture-recording.webm` };
        session = { ...next, messages: [...session.messages, userMessage, next.messages[0]] };
        return json({ session, feedback: null, user_message: userMessage, assistant_message: next.messages[0] }, 201);
      }
      if (url.pathname === '/api/ai-study/sessions/') return json([session]);
      if (url.pathname === '/api/ai-study/sessions/preview/') return json(session);
      if (url.pathname === '/api/accounts/users/preview-student/') return json(user);
      if (url.pathname.endsWith('/progress/overview/')) return json({ recommendation: null });
      if (url.pathname.endsWith('/sidebar-badges/')) return json({});
      return json([]);
    });
    await page.goto(`${origin}/app/treinar-ia/conversa/preview`);
    await expect(page.getByRole('region', { name: 'Resposta por voz' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Sua resposta por texto' })).toHaveCount(0);
    await page.screenshot({ path: `${artifacts}/${viewport.width}-initial.png`, fullPage: true });
    await page.getByRole('button', { name: 'Ouvir pergunta', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('exemplo escrito');
    ttsFails = false;
    await page.getByRole('button', { name: 'Ouvir pergunta', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pausar áudio', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pausar áudio', exact: true }).click();
    await page.getByRole('button', { name: 'Gravar resposta', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Gravando' })).toBeVisible();
    await expect(page.getByLabel('Duração da gravação')).toHaveText('0:02');
    await page.getByRole('button', { name: 'Pausar', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'pausada' })).toBeVisible();
    await page.getByRole('button', { name: 'Continuar gravação', exact: true }).click();
    await page.getByRole('button', { name: 'Enviar áudio', exact: true }).click();
    await expect(page.getByText('Is this your first class?', { exact: true })).toBeVisible();
    await expect(page.getByText('Is this your first class?', { exact: true })).toBeInViewport({ ratio: 0.8 });
    await expect(page.getByText('Conteúdo avaliado a partir da transcrição. Pronúncia não avaliada.')).toBeAttached();
    for (const phase of ['SIMULATE', 'LEARN', 'PRACTICE', 'FEEDBACK']) {
      if (phase !== 'SIMULATE') { session = makeSession(phase); await page.reload(); }
      await expect(page.getByRole('navigation', { name: 'Etapas da prática' })).toBeVisible();
      await page.screenshot({ path: `${artifacts}/${viewport.width}-${phase.toLowerCase()}.png`, fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (overflow) throw new Error(`Horizontal overflow at ${viewport.width}px in ${phase}.`);
    }
    if (errors.length) throw new Error(errors.join('\n'));
    results.push({ width: viewport.width, phases: 4, recordingBytes: recorded.length, recordingType, pageErrors: errors.length });
    await context.close();
  }
  console.log(JSON.stringify({ results, artifacts }, null, 2));
} finally { await browser.close(); }
