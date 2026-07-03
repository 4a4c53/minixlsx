---
name: semantic-commits
description: Analyze the working tree and create clean, atomic, reviewable commits using Conventional Commits.
argument-hint: Optional context to help infer commit intent.
user-invocable: true
---

## Rules

- One commit = one intent.
- Never mix unrelated changes.
- Prefer multiple small commits.
- Never guess ambiguous intent.
- Never stage everything blindly.
- Use Conventional Commits (RFC 3.0).
- Agent commits must use `--no-gpg-sign`.
- Human signs commits afterward.
- Never add `Co-authored-by` trailers or any co-author metadata.
- Never use `--author` or otherwise attribute commits to anyone other than the current Git author.
- Never create empty commits.
- Check for whitespace errors and line ending issues before each commit.
- Only run tests when repository has a minimal test suite (≤10s on standard hardware).

## Workflow

### 1. Inspect

Run:

```bash
git status --short
git diff --cached
git diff
git ls-files --others --exclude-standard
```

If:

- clean tree → report and stop
- merge conflict → stop
- intent is unclear → leave changes unstaged

### 2. Issue Key

Check:

```bash
git branch --show-current
```

If branch contains:

- `ABC-123`
- `#123`

prepend it to commit messages.

Otherwise omit it.

### 3. Group Changes

Group by intent:

- feat — new feature
- fix — bug fix
- revert — revert previous commit
- refactor — code refactor (no behavior change)
- docs — documentation
- test — tests or test fixes
- style — formatting (no code change)
- chore — tooling, deps (no user-facing change)
- build — build system or compiler changes
- ci — CI/CD pipeline changes
- perf — performance improvement

Use:

```bash
git add -p
```

or explicit `git add <file>`.

Avoid:

```bash
git add .
git add -A
```

unless everything belongs together.

## Commit Format

```text
<type>[(<scope>)][!]: [emoji] <subject>
```

Examples (emojis optional, based on repo convention):

```text
feat(auth): add email verification
feat(auth)!: ✨ remove password auth
fix(api): 🐛 prevent duplicate requests
docs: update setup guide
revert: revert commit abc1234
```

Rules:

- type: required (feat, fix, revert, docs, test, etc.)
- scope: use ONLY if changes affect 1–2 clear modules;
  omit for repo-wide changes (docs, chores, etc.)
- `!` before `:` signals BREAKING CHANGE (impacts Semantic Versioning)
- emoji: optional; use only if repo already uses them
- imperative mood ("add", not "adds" or "added")
- present tense
- ≤72 chars first line
- subject ≤50 chars after emoji (if used)
- describe intent, not file operations

## Body

Include only when needed:

- algorithm changes
- behavioral changes
- non-obvious fixes
- large features

Explain **why**, not **what**.

## BREAKING CHANGE

For breaking changes, use one of these formats:

**Method 1:** Append `!` before colon (recommended, most visible):

```text
feat(api)!: redesign authentication flow
```

**Method 2:** Add footer (for detailed explanation):

```text
feat(api): redesign authentication flow

BREAKING CHANGE: old token format no longer accepted
```

You can combine both:

```text
feat(api)!: redesign authentication flow

BREAKING CHANGE: old token format no longer accepted
Migration: see docs/MIGRATION.md
```

**Important:** Commits with BREAKING CHANGE trigger major version bumps in Semantic Versioning.

## Footer

Use for:

- issue references (Closes #123, Refs #456)
- BREAKING CHANGE: (if not using `!`)
- migration notes
- co-reviewers (not co-authors)

## Splitting

Split commits whenever intent differs.

Keep together only when changes directly support the same feature/fix (including tests/docs).

## Commit

### Pre-commit Checks

Before each commit, always run:

```bash
# Check for whitespace errors, line ending issues
git diff --check --cached

# Verify staged changes are intentional
git diff --cached

# Prevent empty commits
if git diff-index --cached --quiet HEAD; then
  echo "error: nothing staged"
  exit 1
fi
```

### Testing

If the repo has a fast test suite (< 10s):

```bash
# Run minimal test suite (e.g., lint, format check, critical tests)
pnpm test:quick  # or npm test, make test, etc.
```

If tests fail, fix the staged changes before proceeding.

### Create Commit

```bash
git commit --no-gpg-sign -m "<message>"
```

Never use:

```bash
git commit -S              # GPG signing in sandbox
git commit --author="..." # Attribute commits elsewhere
```

Do not add `Co-authored-by:` trailers to the commit message under any circumstances.

## Safety

Never commit:

- secrets
- real `.env`
- credentials
- tokens
- temporary/debug files
- unintended generated assets

If unrelated files are staged:

```bash
git restore --staged <file>
```

## Integration with Semantic Versioning

Each commit type maps to version bumps:

| Commit Type                   | Version Impact | Example                                |
| ----------------------------- | -------------- | -------------------------------------- |
| `feat`                        | Minor (Y.X.0)  | `feat(auth): add email verification`   |
| `feat!` or `BREAKING CHANGE`  | Major (X.0.0)  | `feat(api)!: redesign token format`    |
| `fix`                         | Patch (Y.X.Z)  | `fix(api): prevent duplicate requests` |
| `revert`                      | Patch          | `revert: revert commit abc1234`        |
| `refactor`, `perf`, `style`   | No bump        | Included in patch                      |
| `docs`, `test`, `chore`, `ci` | No bump        | Not included in version                |

The commit log is the source of truth for version calculation. Refer to the `semantic-versioning` skill for detailed rules.

## Finish

After each commit:

```bash
git status --short
```

Continue until:

- all intentional changes are committed
- ambiguous changes remain unstaged
- unsafe files are excluded

Report:

- commits created
- skipped files
- ambiguous changes
- safety exclusions

For human signing afterward:

```bash
git commit --amend --no-edit -S
```

or for multiple commits:

```bash
git rebase --exec 'git commit --amend --no-edit -S' HEAD~N
```

Verify commits:

```bash
git log --pretty=format:"%h %G? %s" -5
```
