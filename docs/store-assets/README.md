# Materiais das lojas

- `google-play-icon-512.png`: ícone da listagem Google Play, derivado do logo existente.
- `screenshots/google-play-feature-1024x500.png`: imagem de destaque.
- `screenshots/iphone-*.png`: capturas 1320×2868.
- `screenshots/ipad-*.png`: capturas 2048×2732.
- `screenshots/android-*.png`: capturas 1080×1920.

As capturas mostram a interface real com dados fictícios de teste. Não são evidência de teste físico, de conexão à API de produção ou de aprovação das lojas. Confira o conteúdo, a classificação e as dimensões aceitas no console antes de cadastrar.

Para regenerar no Mac com Chrome instalado:

```bash
MOBILE_STORE_SCREENSHOT_DIR=docs/store-assets/screenshots npx playwright test --config playwright.mobile.config.ts tests/mobile/store-screenshots.spec.ts
```

Para regenerar ícones e splash nativos do logo existente, use `npm run mobile:assets` no macOS. A licença da fonte empacotada está em `assets/mobile/FONT-LICENSE.txt`.
