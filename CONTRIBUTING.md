# Contributing

Engineering practices for Skill Sync AI project. All team members and AI assistants should follow these conventions.

## Branch Naming

Use the following prefixes:

- `feat/` — new feature
- `fix/` — bug fix
- `chore/` — maintenance, config, tooling
- `docs/` — documentation only
- `refactor/` — code change that isn't a fix or feature
- `test/` — adding or updating tests

Examples:

- `feat/auth-routes`
- `feat/saved-locations`
- `fix/weather-api-params`
- `chore/mongodb-setup`

## Git Workflow

1. Always branch off `main`
2. Pull latest dev before starting any work

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

Common types:

- `feat` — new feature
- `fix` — bug fix
- `chore` — maintenance, config, tooling
- `docs` — documentation only
- `refactor` — code change that isn't a fix or feature
- `test` — adding or updating tests

Rules:

- Keep subject line under 72 characters
- Use imperative mood — "add", not "added" or "adds"
- Lowercase after the colon
- No period at the end

Examples:

- `feat(auth): add signup route with bcrypt hashing`
- `fix(weather): correct API parameter for daily forecast`
- `chore(db): connect MongoDB Atlas to Express server`

## Pull Request Format

```md
## Summary

Briefly explain what this pull request does.

## Changes

- List the main changes made in this PR
- Keep each bullet short and specific

## Testing

- Explain how the change was tested
- If no tests were run, explain why
```

## Pre-PR Checklist

Before opening a pull request:

1. Pull latest main and merge into your branch

```bash
   git switch main
   git pull
   git switch your-branch-name
   git merge dev
```

2. Run `npm install` in both `client/` and `server/` to make sure dependencies are up to date
3. Test your changes locally and confirm nothing is broken
4. Make sure no `console.log` statements are left in your code
5. Push your branch to GitHub
6. Fill out the PR description — Summary, Changes, Testing

## Code Comment Guidelines

1. Comment **why**, not just **what**
2. Use comments only for non-obvious logic
3. Keep comments brief, specific, and direct
4. Avoid comments that simply repeat the code
5. Remove temporary learning comments before finishing the file

```

Not required for every function — use judgment. Prioritize documenting functions with non-obvious inputs, outputs, or behavior.

## Environment Variables

Never commit `.env` files. Use `.env.example` as a template.

### `/client/.env`
No environment variables needed for the frontend currently.

### `/server/.env`
```

PORT=3001
MONGODB_URI=your_mongodb_connection_string
SESSION_SECRET=your_random_secret

```

```
