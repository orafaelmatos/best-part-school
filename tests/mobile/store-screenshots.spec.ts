import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { mockStudent } from './student-fixture';

const output = process.env.MOBILE_STORE_SCREENSHOT_DIR;
test.skip(!output, 'Run with MOBILE_STORE_SCREENSHOT_DIR to export store listing previews.');

for (const device of [
  { name: 'iphone', viewport: { width: 440, height: 956 }, scale: 3 },
  { name: 'ipad', viewport: { width: 1024, height: 1366 }, scale: 2 },
  { name: 'android', viewport: { width: 360, height: 640 }, scale: 3 },
]) {
  test(`export ${device.name} store screenshots with fictional student data`, async ({ browser }) => {
    mkdirSync(output!, { recursive: true });
    const context = await browser.newContext({ viewport: device.viewport, deviceScaleFactor: device.scale, locale: 'pt-BR' });
    const page = await context.newPage();
    await mockStudent(page);
    for (const [name, route, text] of [
      ['inicio', '/app', 'Talking about your plans'],
      ['aulas', '/app/aulas', 'Everyday conversations'],
      ['estudar', '/app/estudar', 'Atividades da aula'],
      ['ia', '/app/treinar-ia?mode=new', 'Como quer praticar?'],
      ['perfil', '/app/perfil', 'Privacidade e IA'],
    ]) {
      await page.goto(`${test.info().project.use.baseURL}/#${route}`);
      await expect(page.getByRole('main')).toContainText(text);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${output}/${device.name}-${name}.png`, fullPage: false, animations: 'disabled' });
    }
    await context.close();
  });
}

test('export the Google Play feature graphic from the existing school logo', async ({ page }) => {
  mkdirSync(output!, { recursive: true });
  await page.setViewportSize({ width: 1024, height: 500 });
  const logo = readFileSync('public/img/bps-logo.png').toString('base64');
  await page.setContent(`<html><body style="margin:0"><main style="box-sizing:border-box;width:1024px;height:500px;background:#f6f7fb;display:flex;align-items:center;padding:56px;gap:50px;color:#14243a;font-family:Arial,sans-serif"><img alt="Best Part School" src="data:image/png;base64,${logo}" style="width:278px;height:278px;border-radius:32px"><div><p style="color:#137c78;font-size:20px;font-weight:700;letter-spacing:2px">BEST PART SCHOOL</p><h1 style="font-size:46px;line-height:1.15;margin:24px 0">Seu inglês.<br>Seu próximo passo.</h1><p style="font-size:21px;line-height:1.5;margin:0">Aulas, estudos e prática com IA.</p></div></main></body></html>`);
  await page.locator('img').evaluate((image: HTMLImageElement) => image.decode());
  await page.screenshot({ path: `${output}/google-play-feature-1024x500.png` });
});
