// Browser smoke test for student and teacher sentence creation. All API calls are local fixtures.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const origin = process.env.SENTENCES_PREVIEW_URL || 'http://127.0.0.1:4173';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Use a local preview server.');
const artifacts = process.env.SENTENCES_PREVIEW_ARTIFACTS || '/private/tmp/word-sentences';
await mkdir(artifacts, { recursive: true });
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: process.env.SENTENCES_BROWSER_PATH || (existsSync(chrome) ? chrome : chromium.executablePath()) });
const simple = { source_word: 'happy', sentence: 'I am happy.', translation: 'Eu estou feliz.' };
const harder = { ...simple, sentence: 'I am happy because my sister is here.', translation: 'Estou feliz porque minha irmã está aqui.' };
const easier = { ...simple, sentence: 'I feel happy.', translation: 'Eu me sinto feliz.' };
const batch = [{ source_word: 'airport', sentence: 'We are at the airport.', translation: 'Estamos no aeroporto.' },
  { source_word: 'achievement', sentence: 'This is a great achievement.', translation: 'Esta é uma grande conquista.' }];
const revised = { ...batch[0], sentence: 'I work at the airport because I like planes.', translation: 'Eu trabalho no aeroporto porque gosto de aviões.' };
const results = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 568 }].filter(v => !process.env.SENTENCES_PREVIEW_WIDTH || v.width === Number(process.env.SENTENCES_PREVIEW_WIDTH))) {
    for (const role of ['student', 'teacher']) {
      const context = await browser.newContext({ viewport });
      const user = { user_id: `preview-${role}`, email: `${role}@example.test`, name: role === 'student' ? 'Ana' : 'Professor', role, level: 'A1', exp: Math.floor(Date.now() / 1000) + 3600 };
      const student = { ...user, id: 'preview-student', user_id: 'preview-student', role: 'student', name: 'Ana' };
      const lesson = { id: 'lesson-preview', title: 'Travel', level: 'B2', student: 'preview-student', student_name: 'Ana', teacher: 'preview-teacher', teacher_name: 'Professor',
        status: 'completed', date: '2026-11-10T15:00:00Z', duration: 60, notes: '<p>Travel words.</p>', meeting_url: '', attachments: [], new_words: [], is_template: false, order: 1, group: null };
      const token = [Buffer.from('{}').toString('base64url'), Buffer.from(JSON.stringify(user)).toString('base64url'), 'fixture'].join('.');
      await context.addInitScript(({ token, origin }) => { localStorage.setItem('token', token); window.__APP_CONFIG__ = { VITE_API_URL: `${origin}/api/`, VITE_MEDIA_BASE_URL: origin }; }, { token, origin });
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      let generated = 0, saved = 0, batchSaved = 0, batchGenerated = 0, failEasier = role === 'student';
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
        if (url.pathname === '/api/vocabulary-cards/generate-word-sentence/') {
          const body = request.postDataJSON();
          if (body.source_word === 'airport') {
            if (body.previous_sentence !== batch[0].sentence || body.adjustment !== 'harder' || body.student_id !== undefined) throw new Error('Personal vocabulary rewrite lost the word or targeted another user.');
            return json({ item: revised, level: 'A1' });
          }
          if (body.source_word !== 'happy' || (role === 'teacher' && body.student_id !== 'preview-student')) throw new Error('Wrong source word or student scope.');
          if (body.adjustment !== 'standard' && !body.previous_sentence) throw new Error('Rewrite lost the current sentence.');
          if (body.adjustment === 'easier' && failEasier) { failEasier = false; return json({ detail: 'Não foi possível refazer agora. A frase anterior foi mantida.' }, 503); }
          generated++;
          return json({ item: body.adjustment === 'harder' ? harder : body.adjustment === 'easier' ? easier : simple, level: 'A1' });
        }
        if (url.pathname === '/api/vocabulary-cards/save-word-sentence/') {
          const body = request.postDataJSON();
          if (body.source_word !== 'happy' || body.sentence !== easier.sentence || (role === 'teacher' && body.student_id !== 'preview-student')) throw new Error('Saved the wrong version or student.');
          saved++;
          return json({ created: true, card: { id: 'saved-card', word: body.sentence } }, 201);
        }
        if (url.pathname.endsWith('/generate-word-sentences/')) {
          if (url.pathname === '/api/vocabulary-cards/generate-word-sentences/') {
            const body = request.postDataJSON();
            if (JSON.stringify(body.words) !== JSON.stringify(['airport', 'achievement']) || body.student_id !== undefined) throw new Error('Personal vocabulary batch did not deduplicate or targeted another user.');
            batchGenerated++;
          }
          return json({ items: batch, level: 'A1' });
        }
        if (url.pathname === '/api/vocabulary-cards/save-word-sentences/') {
          const body = request.postDataJSON();
          if (body.items.length !== 1 || body.items[0].sentence !== revised.sentence || body.items[0].translation !== 'Trabalho no aeroporto porque gosto de aviões.' || body.student_id !== undefined) throw new Error('Personal vocabulary batch saved the wrong selection, edits or owner.');
          batchSaved++;
          return json({ created_count: 1, skipped_count: 0 }, 201);
        }
        if (url.pathname.endsWith('/rewrite-word-sentence/')) {
          const body = request.postDataJSON();
          if (body.source_word !== 'airport' || body.previous_sentence !== batch[0].sentence || body.adjustment !== 'harder') throw new Error('Lesson rewrite did not preserve its word/current sentence.');
          return json({ item: revised, level: 'A1' });
        }
        if (url.pathname.endsWith('/approve-word-sentences/')) {
          const body = request.postDataJSON();
          if (body.items[0].source_word !== 'airport' || body.items[0].sentence !== revised.sentence || body.items[1].sentence !== batch[1].sentence) throw new Error('Approval did not save the reviewed draft.');
          lesson.new_words = body.items.map((item, index) => ({ id: `word-${index}`, word: item.sentence, meaning: item.translation, level: lesson.level }));
          return json({ created_count: 2, skipped_count: 0 }, 201);
        }
        if (url.pathname === '/api/accounts/users/preview-student/') return json(student);
        if (url.pathname === `/api/accounts/users/${user.user_id}/`) return json(user);
        if (url.pathname === '/api/accounts/users/') return json([student]);
        if (url.pathname === '/api/lessons/lesson-preview/') {
          if (request.method() === 'PATCH') Object.assign(lesson, request.postDataJSON());
          return json(lesson);
        }
        if (url.pathname === '/api/lessons/') return json([lesson]);
        if (url.pathname === '/api/vocabulary-cards/dashboard/') return json({ due_today: saved, overdue: 0, mastered: 0, difficult: 0, study_streak: 0, review_accuracy: 0, total_learned_words: saved, reviewed_30_days: 0 });
        if (url.pathname.endsWith('/speaking-reports/') || url.pathname.endsWith('/writing-reports/')) return json({ count: 0, next: null, previous: null, results: [] });
        if (url.pathname.endsWith('/progress/overview/')) return json({ recommendation: null, review_history: [], speaking_sessions: { total: 0, completed: 0 } });
        if (url.pathname.endsWith('/recommendations/current/')) return json(null);
        if (url.pathname.endsWith('/sidebar-badges/')) return json({});
        return json([]);
      });
      const checkWidth = async stage => {
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) {
          await page.screenshot({ path: `${artifacts}/${viewport.width}-${role}-${stage}-overflow.png`, fullPage: true });
          console.log(await page.evaluate(() => [...document.querySelectorAll('main *')].filter(el => el.getBoundingClientRect().right > innerWidth).map(el => ({ tag: el.tagName, text: el.textContent?.slice(0, 80), width: el.getBoundingClientRect().width })).slice(-12)));
          throw new Error(`Overflow at ${viewport.width}px (${role}, ${stage}).`);
        }
      };
      await page.goto(role === 'student' ? `${origin}/app` : `${origin}/app/alunos/preview-student/aulas`);
      const section = page.getByRole('region', { name: role === 'student' ? 'Criar minha frase com IA' : 'Criar frases para o aluno' });
      await expect(section).toBeVisible();
      await section.getByRole('button', { name: /Adicionar uma palavra nova/ }).click();
      await section.getByRole('textbox').fill('happy');
      await section.getByRole('button', { name: 'Criar frase com IA', exact: true }).click();
      await expect(section.getByText(simple.sentence, { exact: true })).toBeVisible();
      await expect(section.getByText('Nível de referência: A1')).toBeVisible();
      if (saved) throw new Error('Generated sentence was automatically saved.');
      await section.getByRole('button', { name: 'Refazer mais difícil' }).click();
      await expect(section.getByText(harder.sentence, { exact: true })).toBeVisible();
      await section.getByRole('button', { name: 'Refazer mais fácil' }).click();
      if (role === 'student') {
        await expect(section.getByRole('alert')).toContainText('frase anterior foi mantida');
        await expect(section.getByText(harder.sentence, { exact: true })).toBeVisible();
        await section.getByRole('button', { name: 'Refazer mais fácil' }).click();
      }
      await expect(section.getByText(easier.sentence, { exact: true })).toBeVisible();
      await expect(section.getByRole('textbox')).toHaveValue('happy');
      await checkWidth('generated');
      await page.screenshot({ path: `${artifacts}/${viewport.width}-${role}-generated.png`, fullPage: true });
      await section.getByRole('button', { name: 'Salvar frase para revisar' }).click();
      await expect(section.getByRole('status')).toContainText('Frase salva!');
      await expect(section.getByRole('button', { name: 'Frase salva para revisar' })).toBeDisabled();
      await page.goto(`${origin}/app/palavras-aprendidas`);
      await page.getByRole('button', { name: /Adicionar nova palavra/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Adicionar nova palavra' });
      await expect(dialog.getByRole('tab', { name: 'Cadastrar palavra' })).toHaveAttribute('aria-selected', 'true');
      await dialog.getByRole('tab', { name: 'Gerar frases com IA' }).click();
      await expect(dialog.getByLabel('Aluno que vai praticar')).toHaveCount(0);
      const vocabularySection = dialog.getByRole('region', { name: 'Frases com IA', exact: true });
      await vocabularySection.getByLabel('Lista de palavras ou expressões').fill('airport, achievement; Airport');
      await checkWidth('vocabulary-input');
      await vocabularySection.getByRole('button', { name: 'Gerar frases', exact: true }).click();
      const vocabularyRow = vocabularySection.getByRole('group', { name: 'Sugestão com airport' });
      await expect(vocabularyRow.getByLabel('Frase em inglês (frente)')).toHaveValue(batch[0].sentence);
      if (batchSaved) throw new Error('Vocabulary batch was automatically saved.');
      await vocabularyRow.getByRole('button', { name: 'Refazer mais difícil' }).click();
      await expect(vocabularyRow.getByLabel('Frase em inglês (frente)')).toHaveValue(revised.sentence);
      await vocabularyRow.getByLabel('Tradução em português (verso)').fill('Trabalho no aeroporto porque gosto de aviões.');
      await vocabularySection.getByRole('checkbox', { name: 'Incluir achievement' }).uncheck();
      await checkWidth('vocabulary-drafts');
      await page.screenshot({ path: `${artifacts}/${viewport.width}-${role}-vocabulary.png`, fullPage: true });
      await vocabularySection.getByRole('button', { name: 'Salvar 1 frase', exact: true }).click();
      await expect(vocabularyRow).toHaveCount(0);
      await expect(vocabularySection.getByRole('group', { name: 'Sugestão com achievement' })).toBeVisible();
      if (batchSaved !== 1 || batchGenerated !== 1) throw new Error('Vocabulary batch was not generated and saved once.');
      if (role === 'teacher') {
        await page.goto(`${origin}/app/aulas/lesson-preview/anotar`);
        const batchSection = page.getByRole('region', { name: 'Frases com IA' });
        await batchSection.getByRole('button', { name: 'Gerar frases com IA' }).click();
        await batchSection.getByLabel('Lista de palavras ou expressões').fill('airport, achievement');
        await batchSection.getByRole('button', { name: 'Gerar frases', exact: true }).click();
        const row = batchSection.getByRole('group', { name: 'Sugestão com airport' });
        await row.getByRole('button', { name: 'Refazer mais difícil' }).click();
        await expect(row.getByLabel('Frase em inglês (frente)')).toHaveValue(revised.sentence);
        await expect(batchSection.getByRole('group', { name: 'Sugestão com achievement' }).getByLabel('Frase em inglês (frente)')).toHaveValue(batch[1].sentence);
        await checkWidth('lesson-drafts');
        await page.screenshot({ path: `${artifacts}/${viewport.width}-teacher-lesson.png`, fullPage: true });
        await batchSection.getByRole('button', { name: 'Aprovar e salvar 2 frases' }).click();
        await expect(page.getByText(revised.sentence, { exact: true })).toBeVisible();
      }
      if (errors.length) throw new Error(errors.join('\n'));
      results.push({ width: viewport.width, role, generated, saved, batchGenerated, batchSaved, harderAndEasier: 'passed' });
      await context.close();
    }
  }
  console.log(JSON.stringify({ artifacts, results }, null, 2));
} finally { await browser.close(); }
process.exit(0);
