# Contributing

Thanks for helping build SkillSync! These are the engineering practices for the project. All contributors, human or AI assistant, should follow them. Please also read the [Code of Conduct](CODE_OF_CONDUCT.md).

New here? Start with the [README](README.md) to get it running, then [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it fits together and [DECISIONS.md](DECISIONS.md) for why.

## Branch Naming

Use the following prefixes:

- `feat/`: new feature
- `fix/`: bug fix
- `chore/`: maintenance, config, tooling
- `docs/`: documentation only
- `refactor/`: code change that isn't a fix or feature
- `test/`: adding or updating tests

Examples:

- `feat/compare-table`
- `fix/csv-quotes`
- `chore/railway-deploy`
- `docs/supabase-setup`

## Git Workflow

1. Always branch off `main`
2. Pull the latest `main` before starting any work

```bash
git switch main
git pull
git switch -c feat/your-branch-name
```

3. Keep commits focused and use conventional commit messages
4. Push your branch and open a PR to `main`
5. Request a review before merging
6. Never push directly to `main`

## Commit Messages

Follow the Conventional Commits spec: `<type>(<scope>): <short description>`

Common types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`

Rules:

- Keep the subject line under 72 characters
- Use imperative mood: "add", not "added" or "adds"
- Lowercase after the colon
- No period at the end

Examples:

- `feat(ui): drag and drop resumes into the upload box`
- `fix(prompt): keep requirements to what a resume can show`
- `chore(deploy): read urls and port from env`

## Pull Requests

Fill out the [PR template](.github/pull_request_template.md): what changed and why, and how you (and reviewers) can verify it.

### Pre-PR Checklist

1. Merge the latest `main` into your branch

```bash
git switch main
git pull
git switch your-branch-name
git merge main
```

2. Run `npm install` in both `backend/` and `frontend/`
3. Run the checks:

```bash
cd backend && npm test && npm run build
```

```bash
cd frontend && npm run lint && npm run build
```

4. If you changed a prompt (`backend/src/prompt.ts`), the scoring, or `OPENAI_MODEL`, also run `npm run eval` in `backend/` and put the score (e.g. `6 / 6`) in your PR. It uses your own `OPENAI_API_KEY` and costs a few cents.
5. Test your change in the browser and confirm nothing else broke
6. Make sure no stray `console.log` statements are left in your code
7. If your change affects how things work or why, update the docs (see below)

## Tests and Evals

- **Unit tests** (`npm test` in `backend/`) use Jest, with services mocked, so they never call Supabase or OpenAI. Put a test next to the file it tests (`scoring.ts` and `scoring.test.ts`).
- **Evals** (`npm run eval`) measure the *quality* of the AI's answers against a golden dataset in `backend/src/eval/goldenDataset.ts`. Add a case when you find an input the AI gets wrong.
- The frontend doesn't have a test runner yet.

## Code Comment Guidelines

Comment new code thoroughly, so teammates can follow it without guessing.

1. Give every new file, component, function, and non-obvious piece of state or logic a short comment saying what it does and **why**
2. Use plain language; assume the reader is a teammate who didn't write it
3. Explain decisions and gotchas (e.g. "only the status is logged; OpenAI's error text can echo part of the key")
4. Avoid comments that just repeat the code line by line
5. Keep comments up to date when you change the code

## Documentation

Each concept has one home; link to it instead of copying it.

| Doc | Update it when you… |
|---|---|
| [README.md](README.md) | change setup, env vars, scripts, or what the app does |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | change an API endpoint, the pipeline, scoring, or what's stored |
| [docs/PRIVACY.md](docs/PRIVACY.md) | change what data is stored, sent, or logged |
| [DECISIONS.md](DECISIONS.md) | make a choice someone might later ask "why?" about |
| `backend/src/*/zNOTES.md` | change how routes, controllers, or services fit together |

## Environment Variables

Never commit `.env` files. Copy the templates and fill them in:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Every variable is explained in the [README](README.md#environment-variables) and in the `.env.example` files. If you add a variable, add it to the matching `.env.example` (with a placeholder value, never a real key) and to the README table.

## Privacy and Test Data

SkillSync handles resumes, which are personal data:

- Never commit real resumes, real candidate data, or real job applicants' names, in tests, evals, screenshots, or issues. Use made-up examples.
- Don't add code that logs resume text, job posting text, or API keys.
- Keep the app private by default: any change that stores new data should be opt-in and documented in [docs/PRIVACY.md](docs/PRIVACY.md).

Found a security problem? Don't open a public issue; see [SECURITY.md](SECURITY.md).
