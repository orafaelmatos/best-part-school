import { expect, test, type Page } from "@playwright/test";

// Mocked accounts exist only in this browser test. No product login bypass is used.
const student = {
  user_id: "mobile-test-student",
  email: "aluno@example.test",
  name: "Ana Silva",
  role: "student",
  level: "A2",
  exp: Math.floor(Date.now() / 1000) + 3600,
};
const access = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify(student)).toString("base64url")}.test`;
const lessonDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const completedDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const lessons = [
  { id: "lesson-1", title: "Everyday conversations", status: "completed", date: completedDate, order: 1, level: "A2", teacher_name: "João", new_words: [], attachments: [] },
  { id: "lesson-2", title: "Talking about your plans", status: "scheduled", date: lessonDate, order: 2, level: "A2", teacher_name: "João", new_words: [], attachments: [], meeting_url: "https://example.test/classroom" },
];
const homework = {
  id: "homework-1", title: "Practice your daily routine", status: "pending", due_date: lessonDate,
  description: "Revise as expressões da última aula.", lesson: "lesson-1", lesson_title: lessons[0].title,
  classification: "Revisão", teacher_name: "João", auto_correction_enabled: false,
  questions: [{ id: "question-1", type: "open_text", prompt: "Tell us about your daily routine.", options: [], order: 1 }], answers: [],
};
const vocabulary = { due_today: 4, overdue: 2, total_learned_words: 32, total_cards: 32, difficult_cards: 2, mastered_cards: 12, new_cards: 10 };
const practiceSession = {
  id: "session-1", title: "Speaking practice", mode: "speaking", title_source: "auto", is_pinned: false,
  status: "active", message_count: 1, created_at: completedDate, updated_at: completedDate,
  last_interaction_at: completedDate, messages: [{ id: "message-1", role: "assistant", content_type: "text", text: "Hello! Tell me about your plans for this week.", created_at: completedDate }],
};
const practiceSessions = Array.from({ length: 15 }, (_, index) => ({
  ...practiceSession, id: `session-${index + 1}`, title: index === 0 ? practiceSession.title : `Speaking practice ${index + 1}`,
}));

async function mockStudent(page: Page) {
  await page.addInitScript(({ access }) => {
    localStorage.setItem("token", access);
    localStorage.setItem("refreshToken", "test-only-refresh");
  }, { access });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    const responses: Record<string, unknown> = {
      "/lessons/": lessons,
      [`/students/${student.user_id}/lesson-summaries/`]: [],
      "/homework/": [homework],
      "/homework/homework-1/": homework,
      "/vocabulary-cards/dashboard/": vocabulary,
      "/vocabulary-cards/": [],
      "/vocabulary-categories/": [],
      "/ai-study/sessions/": practiceSessions,
      "/ai-study/sessions/session-1/": practiceSession,
      "/ai-study/context-lessons/": [],
      "/ai-study/progress/overview/": { recommendation: null, speaking_history: [], writing_history: [] },
      "/sidebar-badges/": {
        homework: { count: 1, pending_homework: 1, state: "warning" },
        learned_words: { count: 6, overdue_reviews: 2, difficult_cards: 2, state: "warning" },
        finance: { count: 0, state: "none" },
      },
      [`/accounts/users/${student.user_id}/`]: { id: student.user_id, name: student.name, photo_url: null },
    };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(responses[path] ?? []) });
  });
}

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
    await expect(page.getByRole("link", { name: /Financeiro/ })).toHaveAttribute("href", "#/app/financeiro");
    await expect(page.getByRole("link", { name: /Cursos e materiais/ })).toHaveAttribute("href", "#/app/marketplace");
    await expectNoHorizontalOverflow(page);
    await screenshot(page, `student-profile-${width}`);

    await page.goto("/#/app/treinar-ia?mode=new");
    await expect(page.getByRole("heading", { name: "Como quer praticar?" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(page, `student-practice-${width}`);

    await page.goto("/#/app/treinar-ia/conversa/session-1");
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
