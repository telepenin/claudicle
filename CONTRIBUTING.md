# Contributing to Claudicle

Thanks for your interest in contributing to Claudicle! Contributions of all kinds are welcome.

## Prerequisites

- [Docker + Docker Compose](https://docs.docker.com/get-docker/)
- Node.js 22+
- [otelcol-contrib](https://github.com/open-telemetry/opentelemetry-collector-releases/releases) (optional, required only for JSONL session log ingestion)

## Development Setup

1. Fork and clone the repo:
   ```bash
   git clone https://github.com/<your-username>/claudicle.git
   cd claudicle
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the backend (ClickHouse):
   ```bash
   cp .env.example .env
   docker compose up -d
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```
5. Open http://localhost:3000

## Running Tests

```bash
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # coverage report
```

## Code Style

- TypeScript strict mode
- ESLint — run `npm run lint` before submitting
- Tailwind CSS + shadcn/ui for all UI components

## Pull Request Process

1. Create a feature branch from `main`.
2. Make focused, well-described commits.
3. Ensure lint, tests, and build all pass (`npm run lint && npm test && npm run build`).
4. Open a PR against `main` with a clear description of what changed and why.

## Reporting Issues

Open an issue on [GitHub Issues](https://github.com/telepenin/claudicle/issues) and include:

- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node.js version, Docker version)
