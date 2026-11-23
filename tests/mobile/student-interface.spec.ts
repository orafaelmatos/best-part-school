import { expect, test, type Page } from "@playwright/test";

import { student, lessons, homework, mockStudent } from "./student-fixture";

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }))).toMatchObject({ document: await page.evaluate(() => window.innerWidth) });
}

async function screenshot(page: Page, name: string, fullPage = true) {
  const screenshotPath = test.info().outputPath(`${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage, animations: "disabled" });
  await test.info().attach(name, { path: screenshotPath, contentType: "image/png" });
  if (!fullPage && process.env.MOBILE_SCREENSHOT_DIR) {
    await page.evaluate(() => {
      const label = document.createElement("div");
      label.id = "mobile-test-preview-label";
      label.textContent = "PRÉVIA · DADOS SIMULADOS";
      label.style.cssText = "position:fixed;z-index:9999;top:2px;left:50%;transform:translateX(-50%);font:700 8px system-ui;letter-spacing:.06em;color:#137c78;background:#f6f7fb;padding:1px 6px;border-radius:8px;pointer-events:none";
      document.body.append(label);
    });
    await page.screenshot({ path: `${process.env.MOBILE_SCREENSHOT_DIR}/${name}.png`, fullPage: false, animations: "disabled" });
    await page.locator("#mobile-test-preview-label").evaluate((element) => element.remove());
  }
}

for (const width of [360, 390, 430]) {
  test(`student interface works at ${width}px without horizontal scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await mockStudent(page);
    await page.goto("/#/app");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("main")).toContainText(/32/);
    await expectNoHorizontalOverflow(page);
    await screenshot(page, `student-home-${width}`);
    await screenshot(page, `student-home-viewport-${width}`, false);
    const skipLink = page.getByRole("link", { name: "Ir para o conteúdo" });
    await skipLink.focus();
    await skipLink.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    await expect(page).toHaveURL(/#\/app$/);

    const bottomNavigation = page.getByRole("navigation", { name: "Navegação principal do aluno" });
    await expect(bottomNavigation).toBeVisible();
    const navigationBox = await bottomNavigation.boundingBox();
    expect(navigationBox?.y).toBeGreaterThan(600);
    expect((navigationBox?.y || 0) + (navigationBox?.height || 0)).toBeLessThanOrEqual(845);
    const navItems = bottomNavigation.locator("a, button");
    for (let index = 0; index < await navItems.count(); index++) {
      const box = await navItems.nth(index).boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    await bottomNavigation.getByRole("link", { name: /^Aulas/ }).click();
    await expect(page).toHaveURL(/#\/app\/aulas$/);
    await expect(page.getByRole("main")).toContainText(lessons[0].title);
    await expectNoHorizontalOverflow(page);
    await screenshot(page, `student-lessons-${width}`);

    await bottomNavigation.getByRole("link", { name: /Estudar/ }).click();
    await expect(page).toHaveURL(/#\/app\/estudar$/);
    await expect(bottomNavigation.getByRole("link", { name: /Estudar/ })).toHaveAttribute("aria-current", "page");
    await expectNoHorizontalOverflow(page);
    await screenshot(page, `student-study-${width}`);
    await screenshot(page, `student-study-viewport-${width}`, false);
    await page.getByRole("link", { name: /Atividades da aula/ }).click();
    await expect(page.getByRole("button", { name: new RegExp(homework.title) })).toBeVisible();
    await page.getByRole("button", { name: new RegExp(homework.title) }).click();
    await expect(page.getByRole("main")).toContainText(homework.questions[0].prompt);
    await expectNoHorizontalOverflow(page);

    await bottomNavigation.getByRole("link", { name: "Perfil", exact: true }).click();
    await expect(page).toHaveURL(/#\/app\/perfil$/);
    await expect(page.getByRole("heading", { name: student.name, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Financeiro/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Cursos e materiais/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Excluir minha conta", exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(page, `student-profile-${width}`);

    await page.goto("/#/app/treinar-ia?mode=new");
    await expect(page.getByRole("heading", { name: "Como quer praticar?" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(page, `student-practice-${width}`);

    await page.goto("/#/app/treinar-ia/conversa/session-1");
    await page.getByRole("button", { name: "Responder por texto" }).click();
    const composer = page.getByRole("textbox");
    await expect(composer).toBeVisible();
    await composer.fill("My plans for this week");
    await expectNoHorizontalOverflow(page);
    const composerBox = await composer.boundingBox();
    const footerBox = await bottomNavigation.boundingBox();
    expect(composerBox?.y).toBeGreaterThan(68);
    expect((composerBox?.y || 0) + (composerBox?.height || 0)).toBeLessThanOrEqual(footerBox?.y || 0);
    const sendButton = page.getByRole("button", { name: "Enviar mensagem" });
    const sendBox = await sendButton.boundingBox();
    expect((sendBox?.x || 0) + (sendBox?.width || 0)).toBeLessThanOrEqual(width - 20);
    // A parent with overflow:hidden can conceal a clipped control without causing page overflow.
    await expect(sendButton).toBeInViewport({ ratio: 1 });
    await screenshot(page, `student-conversation-${width}`);

    const historyButton = page.getByRole("button", { name: "Abrir histórico de conversas" });
    await historyButton.click();
    const history = page.getByRole("dialog", { name: "Suas conversas" });
    await expect(history).toBeVisible();
    const lastConversation = history.getByRole("button", { name: "Speaking practice 15", exact: true });
    await lastConversation.scrollIntoViewIfNeeded();
    await expect(lastConversation).toBeInViewport({ ratio: 1 });
    await screenshot(page, `student-history-${width}`);
    await page.keyboard.press("Escape");
    await expect(history).not.toBeVisible();
    await expect(historyButton).toBeFocused();
    await bottomNavigation.getByRole("link", { name: "Perfil", exact: true }).click();
    await page.getByRole("button", { name: "Sair da conta" }).click();
    await expect(page).toHaveURL(/#\/login$/);
    expect(errors).toEqual([]);
  });
}

test("student home remains usable on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockStudent(page);
  await page.goto("/#/app");
  await expect(page.getByRole("main")).toContainText(/32/);
  await expectNoHorizontalOverflow(page);
  await screenshot(page, "student-home-desktop");
});

test("login form is usable on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/#/login");
  await expect(page.getByRole("heading", { name: /Seu próximo passo/ })).toBeVisible();
  await page.locator('input[type="email"]').fill("aluno@example.test");
  await page.locator('input[type="password"]').fill("test-only-password");
  await page.getByRole("button", { name: "Mostrar senha" }).click();
  await expect(page.locator('input[autocomplete="current-password"]')).toHaveAttribute("type", "text");
  await expectNoHorizontalOverflow(page);
  await screenshot(page, "student-login-360");
});


test("privacy and support are public and commerce is absent from the mobile app", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/privacidade");
  await expect(page.getByRole("heading", { name: "Política de privacidade", exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("OpenAI");
  await expectNoHorizontalOverflow(page);
  await page.goto("/#/suporte");
  await expect(page.getByRole("link", { name: "gabriel@bestpartschol.com" })).toHaveAttribute("href", /^mailto:/);
  await mockStudent(page);
  for (const path of ["financeiro", "pagamentos", "marketplace"]) {
    await page.goto(`/#/app/${path}`);
    await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Comprar", exact: true })).toHaveCount(0);
  }
});
