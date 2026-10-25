# AccessLens

An account access review dashboard that turns an account inventory into explainable security findings and documented review decisions.

Built as an independent portfolio project using fictional account data.

## The problem

Account spreadsheets can make it difficult to identify access that needs attention and keep track of review decisions. AccessLens brings the inventory, rule findings, and review history into one interface.

## Features

- Import account inventories from CSV with field validation.
- Reject invalid uploads without partially importing their records.
- Reject duplicate usernames without overwriting existing accounts.
- Flag privileged accounts without MFA.
- Flag privileged accounts inactive for 90 days or more.
- Search by username or department and filter flagged accounts.
- Record review decisions, notes, reviewer names, and UTC timestamps.
- Preserve accounts and review history in SQLite.
- Export all accounts and findings to CSV.
- Escape CSV values and prefix potentially executable spreadsheet formulas.

## Technology

- Backend: Python, FastAPI, Pydantic
- Database: SQLite and parameterized SQL
- Frontend: React, TypeScript, Vite, CSS
- Tests: pytest and FastAPI TestClient

## Run locally on Windows

From the repository root:

```powershell
py -m venv backend\.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload
```

Keep that terminal running. In a second terminal:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Open the Local URL printed by Vite. The backend API documentation is available at http://127.0.0.1:8000/docs.

Both servers must remain running during local development.

## Sample inventory

Six fictional accounts are created when the database is initialized. Import `samples/accounts.csv` to add three more.

Required columns:

```csv
username,department,privileged,mfa_enabled,days_inactive,employment_status
```

- Boolean fields accept true, false, 1, or 0.
- Inactivity must be a nonnegative whole number of days.
- Employment status accepts active or terminated.
- Uploads are limited to 1 MB and 1,000 accounts.
- Existing usernames are rejected; imports do not update accounts.

Findings exports contain additional reporting columns and are not import templates.

## Validation

Run backend tests from the repository root:

```powershell
.\backend\.venv\Scripts\python.exe -m pytest backend\tests -q
```

Run frontend checks:

```powershell
npm.cmd --prefix frontend run lint
npm.cmd --prefix frontend run build
```

The backend suite includes 15 tests covering rule boundaries, input validation, successful imports, import rollback, review retrieval, and unchanged findings after review.

## Scope and limitations

This is a demonstration for fictional data. It has no authentication or role-based authorization, and reviewer names are self-reported.

A review decision records a human assessment. It does not change permissions, enable MFA, or resolve a finding automatically. Stored review records are not a tamper-proof audit log.

The current rules cover two specific conditions. An account without flags is not necessarily secure or appropriately authorized. Employment status is stored but is not currently evaluated by a detection rule.

Inactivity is supplied in the inventory and does not update automatically. The application does not connect to a live identity provider or establish regulatory compliance.

## Author

Abtaha Chowdhury
