---
description: Deploy Space Zappers to production via Docker
---

Deploy the application to production via Docker. Follow these steps in order:

## 1. Run Tests
First, run the full test suite to ensure everything passes:
```bash
npm run test
```
If tests fail, stop and fix the issues before proceeding.

## 2. Commit and Push (if needed)
Check for uncommitted changes:
```bash
git status
```
If there are changes, commit them with a descriptive message and push to GitHub.

## 3. Build Docker Image
Build the new Docker image from the latest GitHub code:
```bash
cd /mnt/raid1/GitHub/black-panther/apps-stack
docker compose build space-zappers
```

## 4. Deploy Container
Stop the old container, remove it, and start the new one:
```bash
docker stop space-zappers && docker rm space-zappers
cd /mnt/raid1/GitHub/black-panther/apps-stack
docker compose up -d space-zappers
```

## 5. Verify Deployment
Check both local and production are responding:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001
curl -s -o /dev/null -w "%{http_code}" https://spacezappers.com
```
Both should return 200.

## 6. Check GitHub Actions
Remind the user to check GitHub Actions at: https://github.com/NiniMonk05/space-zappers/actions

Report success or any failures encountered during deployment.
