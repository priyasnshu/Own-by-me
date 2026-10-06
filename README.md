# AI Telegram Automation Backend — GitHub Actions Edition

This is a Node.js/TypeScript Telegram automation backend. It is intentionally **not** a static website, so it does not require `index.html`.

## Important GitHub limitation

GitHub Pages cannot run this backend, and GitHub-hosted Actions runners are temporary. The included production workflow therefore runs the Telegram long-polling process for a runner window and automatically starts it again on the schedule.

For BullMQ jobs that must survive runner restarts (especially the 24-hour poll deletion), `REDIS_URL` must point to a **persistent external Redis service**. Do not use an in-runner Redis instance for production queue persistence.

## GitHub setup

1. Create a GitHub repository.
2. Upload every file in this repository, including `.github/workflows/`.
3. In GitHub, open **Settings → Secrets and variables → Actions**.
4. Add these repository secrets:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHANNEL_ID`
- `ADMIN_TELEGRAM_USER_ID`
- `AUTHORIZED_TELEGRAM_USER_IDS`
- `GEMINI_API_KEY`
- `GEMINI_TEXT_MODEL` (recommended: `gemini-3.8-flash`)
- `GEMINI_VISION_MODEL` (recommended: `gemini-3.8-flash`)
- `REDIS_URL`
- `GOOGLE_CSE_API_KEY`
- `GOOGLE_CSE_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `GOOGLE_DRIVE_FOLDER_ID` (optional)
- `QUICKCHART_API_KEY` (optional)

5. Open **Actions** and enable workflows if GitHub asks.
6. Run **Validate Repository** manually first.
7. Run **Run Telegram Automation Bot → Run workflow**.

The bot uses Telegram long polling, so no public webhook URL is required.

## Why this is not literally 24/7 on GitHub

GitHub-hosted runners have maximum job runtimes and are not intended to be permanent application servers. The bot workflow intentionally exits before the runner limit and is scheduled again. GitHub can delay scheduled workflows, so this is not equivalent to a true 24/7 VPS/service.

If uninterrupted Telegram polling is required, deploy the exact same `npm run build && npm start` application on a persistent Node.js host while keeping this GitHub repository as the source of truth.

## Local run

```bash
npm install
npm run build
npm start
```

Copy `.env.example` to `.env` and provide the required values.

## Security

Never commit `.env`, Telegram tokens, Gemini keys, Google service-account JSON, or Redis credentials. Use GitHub Actions Secrets for deployment.
