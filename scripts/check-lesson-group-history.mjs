// Regression for shared lesson history opened from the calendar. All records/API calls are fixtures.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const origin = process.env.LESSON_PREVIEW_URL || 'http://127.0.0.1:4173';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Use a local preview server.');
const artifacts = process.env.LESSON_PREVIEW_ARTIFACTS || '/private/tmp/lesson-group-history';
await mkdir(artifacts, { recursive: true });
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: process.env.LESSON_BROWSER_PATH || (existsSync(chrome) ? chrome : chromium.executablePath()) });
const results = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    const context = await browser.newContext({ viewport, timezoneId: 'America/Sao_Paulo' });
    const user = { user_id: 'preview-teacher', email: 'teacher@example.test', name: 'Professor', role: 'teacher', exp: Math.floor(Date.now() / 1000) + 3600 };
    const student = { id: 'preview-student', name: 'Aluno de teste', role: 'student', level: 'A2' };
    const base = { teacher: user.user_id, student: null, group: 'group-a', group_name: 'Turma de teste', student_name: 'Turma de teste', group_student_ids: [student.id],
      level: 'A2', attachments: [], new_words: [], is_template: false, meeting_url: '', is_extra: false };
    const current = { ...base, id: 'current', title: 'Aula atual da turma', date: new Date().toISOString(), status: 'in_progress', notes: '', order: 2 };
    const past = { ...base, id: 'past', title: 'Demonstrativos da semana passada', date: new Date(Date.now() - 7 * 86400000).toISOString(), status: 'in_progress', notes: '<p>These are my books. Those are your pencils.</p>', order: 1 };
    const future = { ...base, id: 'future', title: 'Próxima aula da turma', date: null, status: 'pending', notes: '', order: 3 };
    const other = { ...past, id: 'other', group: 'group-b', title: 'Anotações de outra turma', notes: '<p>Outro contexto.</p>' };
    const lessons = [past, current, future, other], saved = [], historyRequests = [];
    const token = [Buffer.from('{}').toString('base64url'), Buffer.from(JSON.stringify(user)).toString('base64url'), 'fixture'].join('.');
    await context.addInitScript(({ token, origin }) => { localStorage.setItem('token', token); window.__APP_CONFIG__ = { VITE_API_URL: `${origin}/api/`, VITE_MEDIA_BASE_URL: origin }; }, { token, origin });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname === '/api/accounts/users/preview-teacher/') return json(user);
      if (url.pathname === '/api/accounts/users/') return json([student]);
      if (url.pathname === '/api/lessons/') {
        if (url.searchParams.has('group')) historyRequests.push(url.searchParams.get('group'));
        // Older APIs ignored the group filter. The UI must still keep other groups out.
        return json(lessons);
      }
      if (url.pathname.startsWith('/api/lessons/')) {
        const lesson = lessons.find(item => url.pathname === `/api/lessons/${item.id}/`);
        if (lesson) {
          if (request.method() === 'PATCH') {
            const data = request.postDataJSON(); saved.push({ id: lesson.id, data }); Object.assign(lesson, data);
            if ('student' in data) throw new Error('A group lesson must not be reassigned to an individual student.');
          }
          return json(lesson);
        }
      }
      if (url.pathname.endsWith('/sidebar-badges/')) return json({});
      return json([]);
    });
    await page.goto(`${origin}/app/aulas/current/anotar?from=calendar`);
    const editor = page.locator('.lesson-notes-editor .ql-editor');
    await expect(editor).toBeVisible();
    await editor.fill('Anotações da aula atual.');
    await page.getByRole('button', { name: 'Ver anotações aulas passadas', exact: true }).click();
    const history = page.getByRole('dialog');
    await expect(history.getByRole('button', { name: /Demonstrativos da semana passada/ })).toBeVisible();
    await expect(history.getByRole('button', { name: /outra turma/ })).toHaveCount(0);
    expect(historyRequests).toContain('group-a');
    await page.screenshot({ path: `${artifacts}/${viewport.width}-history.png` });
    await history.getByRole('button', { name: /Demonstrativos da semana passada/ }).click();
    await expect(page).toHaveURL(`${origin}/app/aulas/past/anotar?group=group-a&main_lesson=current`);
    await expect(editor).toContainText('These are my books.');
    expect(current.notes).toContain('Anotações da aula atual.');
    expect(past.notes).toContain('These are my books.');
    await page.getByRole('button', { name: 'Aula principal', exact: true }).click();
    await expect(page).toHaveURL(`${origin}/app/aulas/current/anotar?group=group-a`);
    await expect(editor).toContainText('Anotações da aula atual.');
    await page.getByRole('button', { name: 'Planejar aula futura', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Próxima aula da turma/ }).click();
    await expect(page).toHaveURL(`${origin}/app/aulas/future/anotar?group=group-a&main_lesson=current`);
    await editor.fill('Planejamento da próxima aula.');
    await page.getByRole('button', { name: 'Aula principal', exact: true }).click();
    await expect(editor).toContainText('Anotações da aula atual.');
    expect(future.notes).toContain('Planejamento da próxima aula.');
    expect(future.status).toBe('pending');
    await page.getByRole('button', { name: 'Marcar como Concluída', exact: true }).click();
    await expect.poll(() => current.status).toBe('completed');
    await page.goto(`${origin}/app/aulas/current/anotar?from=calendar`);
    await page.getByRole('button', { name: 'Ver anotações aulas passadas', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: /Demonstrativos da semana passada/ })).toBeVisible();
    expect(past.status).toBe('in_progress'); // Completion of the past lesson is not required to find its annotations.
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`Horizontal overflow at ${viewport.width}px.`);
    if (errors.length) throw new Error(errors.join('\n'));
    results.push({ width: viewport.width, groupHistory: 'passed', returnToCurrentLesson: 'passed', futurePlanning: 'passed', savedLessonIds: [...new Set(saved.map(item => item.id))] });
    await context.close();
  }
  console.log(JSON.stringify({ artifacts, results }, null, 2));
} finally { await browser.close(); }
process.exit(0);
