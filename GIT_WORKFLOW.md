# Git Workflow

## Branch Strategy

- `main`: stable and deployable branch.
- `dev`: integration branch for ongoing work.

## Daily Flow

1. Start from `dev`.
2. Commit with the commit template (`What is new`, `Why`, `Validation`).
3. Push `dev` frequently.
4. Merge `dev` into `main` only when validated.

## Commands

Create/switch to dev:

```powershell
git checkout dev
```

Commit and push quickly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/push-update.ps1 -Message "feat: <what is new>" -Branch dev
```

Promote dev to main:

```powershell
git checkout main
git pull origin main
git merge --no-ff dev
git push origin main
```
