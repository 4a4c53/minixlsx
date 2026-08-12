---
name: semantic-commits
description: Inspect a Git worktree, group changes by intent, and create clean, atomic Conventional Commits with safe staging and explicit validation. Use when the user asks to review pending changes, suggest commit messages, organize changes into commits, or create commits from the current worktree.
metadata:
  author: José Luis Silva
  version: '1.0.0'
---

# Semantic Commits

Turn a dirty worktree into atomic, reviewable commits while preserving user changes, repository conventions, and Git history.

## 1. Determine mode

- **Review**: inspect and propose commit groups/messages only. Never modify the index or history.
- **Commit**: only when explicitly asked to commit/create/organize commits.
- **Ambiguous**: inspect read-only, propose grouping, then request authorization.

Never amend, rebase, push, rewrite history, or sign commits unless explicitly requested.

## 2. Load repository rules

Before staging or validation, read applicable `AGENTS.md`, `CONTRIBUTING*`, commit templates, hooks, and package-manager instructions. Repository rules override this skill.

Use the configured package manager and never introduce another lockfile.

## 3. Inspect state

Inspect:

```bash
git status --short
git diff --cached --stat
git diff --cached
git diff --stat
git diff
git ls-files --others --exclude-standard
git ls-files -u
git branch --show-current
git log -20 --pretty=format:%s
```

Also inspect relevant untracked files; they are absent from `git diff`. Use targeted inspection for large/binary files.

Record pre-existing staged changes.

Stop when:

- `git ls-files -u` reports conflicts.
- Both index and worktree are clean.

Never reset, checkout, clean, delete, or otherwise discard user changes. Ignore ignored files unless explicitly requested.

## 4. Build atomic commit groups

Infer conventions from recent history: types, scopes, casing, emoji, and issue-key style.

Group by **behavioral intent**, not directory or extension:

- Keep related implementation, tests, migrations, and docs together.
- Separate independent features, fixes, refactors, formatting, generated output, etc.
- Do not split a coherent change merely to reduce size.
- Inspect staged and unstaged content independently; use hunk-level separation when needed.

Prefer types:

`feat`, `fix`, `revert`, `refactor`, `docs`, `test`, `style`, `chore`, `build`, `ci`, `perf`.

Use other types only when established by repository history.

Extract an issue key such as `ABC-123` or `#123` from the branch only when exactly one candidate is unambiguous. Otherwise omit it and report ambiguity.

Before proposing or staging anything, inspect candidate staged, unstaged, and untracked changes for accidental or sensitive content, including credentials, tokens, private keys, real `.env` files, debug/temp files, and unintended generated assets. Stop and report suspicious material.

## 5. Compose messages

Format:

```text
[ISSUE-123] type(scope)!: subject
type(scope)!: subject
```

Omit issue, scope, or `!` when unnecessary.

Rules:

- Match repository casing/style.
- Imperative, present-tense subject describing intent rather than file operations.
- Header ≤72 chars; subject preferably ≤50.
- Scope only for one or two clear modules.
- `!` only for breaking changes.
- Emoji only when consistently established.
- Add a body/footer only when motivation, behavior, migration, trade-offs, or breaking details need explanation.
- Never add `Co-authored-by` or use `--author`.

## 6. Stage safely

**Commit mode only.**

Pre-existing staged changes are user-owned.

- Never silently mix or unstage them.
- When explicitly asked to organize **all** pending changes, selectively unstage unrelated files/hunks if necessary and report it.
- Otherwise leave unrelated staged content untouched.
- If existing staged content prevents an atomic commit, stop and report it.

Stage only explicit paths/hunks:

```bash
git add <path>
git add -p
```

Never use:

```bash
git add .
git add -A
git commit -a
```

Before every commit:

```bash
git diff --check --cached
git diff --cached
git diff --cached --quiet && exit 1
```

Commit only when the index contains exactly one reviewed intent. If mixed changes cannot be separated safely, stop.

## 7. Validate and commit

Run repository-required checks before each commit, using the smallest relevant documented command without skipping mandatory checks.

Do not:

- hide or broadly fix unrelated/pre-existing failures;
- stage unrelated fixes merely to pass validation;
- use `--no-verify`;
- commit after failed validation unless the user explicitly accepts the failure.

Commit with the exact proposed message and current Git author:

```bash
git commit --no-gpg-sign -m "<message>"
```

unless repository signing rules override it.

If hooks fail or modify files, stop and inspect/report the resulting state; never retry blindly.

After success:

```bash
git status --short
git log -1 --format='%h %s'
```

Verify the commit hash before claiming success.

Repeat only when the user requested all eligible changes. Leave unsafe, ambiguous, or unrelated changes pending.

## 8. Report

Reply in the user's language and lead with the outcome.

Report:

1. **Result** — review completed, commits created, or why none were created.
2. **Commits** — verified short hash, exact subject, and one-line intent.
3. **Validation** — commands and pass/fail/skipped status with reason.
4. **Remaining** — uncommitted, ambiguous, unsafe, ignored, or pre-existing staged changes.
5. **Index changes** — any unrelated files/hunks selectively unstaged while reorganizing all changes.

Never claim a commit exists without successful `git commit` plus verified hash. Never claim a clean worktree without confirming `git status --short`.

## Human signing

If requested, provide commands for the user to sign afterward; never sign on their behalf:

```bash
git commit --amend --no-edit -S
git rebase --exec 'git commit --amend --no-edit -S' HEAD~N
git log --pretty=format:"%h %G? %s" -5
```
