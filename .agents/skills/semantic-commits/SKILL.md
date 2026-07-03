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
- Use Conventional Commits.
- Agent commits must use `--no-gpg-sign`.
- Human signs commits afterward.
- Never add `Co-authored-by` trailers or any co-author metadata.
- Never use `--author` or otherwise attribute commits to anyone other than the current Git author.

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

- feat
- fix
- refactor
- docs
- test
- style
- chore
- build
- ci
- perf

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
<type>(<scope>): <emoji> <subject>
```

Examples:

```text
feat(auth): ✨ add email verification
fix(api): 🐛 prevent duplicate requests
docs(core): 📝 update setup guide
```

Rules:

- scope required (except repository-wide chores)
- imperative mood
- present tense
- ≤72 chars first line
- subject ≤50 chars
- describe intent, not file operations

## Body

Include only when needed:

- algorithm changes
- behavioral changes
- non-obvious fixes
- large features

Explain **why**, not **what**.

## Footer

Use for:

- issue references
- breaking changes
- migration notes

## Splitting

Split commits whenever intent differs.

Keep together only when changes directly support the same feature/fix (including tests/docs).

## Commit

Before each commit:

```bash
git diff --cached
```

Commit:

```bash
git commit --no-gpg-sign -m "<message>"
```

Never use:

```bash
git commit -S
git commit --author="..."
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

Always remind:

```bash
git commit --amend --no-edit -S
```

or

```bash
git rebase --exec 'git commit --amend --no-edit -S' HEAD~N
```

Verify:

```bash
git log --pretty=format:"%h %G? %s" -5
```
