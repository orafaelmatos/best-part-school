# Prévia da interface mobile

Estas capturas mostram a interface real no Chrome com viewport de 390 × 844 pixels. Os dados são simulados exclusivamente pelos testes: a conta, as aulas, o professor, as atividades e os contadores não representam uma conta real.

- `student-home-viewport-390.png`: tela Início.
- `student-study-viewport-390.png`: tela Estudar.

A identificação “PRÉVIA · DADOS SIMULADOS” é adicionada somente na captura de teste; ela não faz parte da aplicação.

Para atualizar as capturas, com o Chrome instalado no macOS:

```bash
MOBILE_SCREENSHOT_DIR=docs/screenshots npm run test:mobile -- --grep 'student interface works at 390'
```

Em outro sistema, informe o executável do Chrome em `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, ou use o Chromium instalado pelo Playwright.

Esses testes verificam a interface responsiva no navegador. A validação no simulador iOS e em aparelhos continua necessária para teclado, áreas seguras, permissões, áudio e recursos nativos.
