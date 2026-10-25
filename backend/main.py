from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(
    title="AccessLens API",
    description="Account access risk analysis and review",
    version="0.1.0",
)

class Account(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    privileged: bool = False
    mfa_enabled: bool = True
    days_inactive: int = Field(default=0, ge=0)
    employment_status: str = "active"

@app.get("/api/health")
def health():
    return {"status": "ok", "application": "AccessLens"}

@app.post("/api/analyze")
def analyze(account: Account):
    findings = []
    if account.privileged and not account.mfa_enabled:
        findings.append({
            "rule": "PRIVILEGED_NO_MFA",
            "severity": "high",
            "reason": "Privileged account has no MFA enabled.",
        })
    if account.privileged and account.days_inactive >= 90:
        findings.append({
            "rule": "DORMANT_PRIVILEGED",
            "severity": "high",
            "reason": "Privileged account inactive for at least 90 days.",
        })
    return {
        "username": account.username,
        "findings": findings,
        "requires_review": bool(findings),
    }

from backend.database import initialize_database, list_accounts

initialize_database()

@app.get("/api/accounts")
def get_accounts():
    results = []
    for row in list_accounts():
        account = Account(
            username=row["username"],
            privileged=bool(row["privileged"]),
            mfa_enabled=bool(row["mfa_enabled"]),
            days_inactive=row["days_inactive"],
            employment_status=row["employment_status"],
        )
        result = {
            **row,
            **account.model_dump(),
            **analyze(account),
        }
        results.append(result)

    return {
        "total_accounts": len(results),
        "accounts_requiring_review": sum(
            item["requires_review"] for item in results
        ),
        "total_findings": sum(
            len(item["findings"]) for item in results
        ),
        "accounts": results,
    }

from backend.database import initialize_database, list_accounts

initialize_database()

@app.get("/api/accounts")
def get_accounts():
    results = []
    for row in list_accounts():
        account = Account(
            username=row["username"],
            privileged=bool(row["privileged"]),
            mfa_enabled=bool(row["mfa_enabled"]),
            days_inactive=row["days_inactive"],
            employment_status=row["employment_status"],
        )
        result = {
            **row,
            **account.model_dump(),
            **analyze(account),
        }
        results.append(result)

    return {
        "total_accounts": len(results),
        "accounts_requiring_review": sum(
            item["requires_review"] for item in results
        ),
        "total_findings": sum(
            len(item["findings"]) for item in results
        ),
        "accounts": results,
    }

from contextlib import closing
from datetime import datetime, timezone
from typing import Literal
from fastapi import HTTPException
from backend.database import connect

class ReviewDecision(BaseModel):
    reviewer: str = Field(min_length=1, max_length=100)
    decision: Literal[
        "approved",
        "revoke_requested",
        "investigation_required",
    ]
    note: str = Field(min_length=1, max_length=2000)

def initialize_reviews():
    with closing(connect()) as connection:
        with connection:
            connection.execute("""
                CREATE TABLE IF NOT EXISTS reviews (
                    id INTEGER PRIMARY KEY,
                    account_id INTEGER NOT NULL,
                    reviewer TEXT NOT NULL,
                    decision TEXT NOT NULL CHECK(decision IN (
                        'approved',
                        'revoke_requested',
                        'investigation_required'
                    )),
                    note TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(account_id) REFERENCES accounts(id)
                )
            """)

initialize_reviews()

@app.get("/api/accounts/{account_id}/reviews")
def get_reviews(account_id: int):
    with closing(connect()) as connection:
        account = connection.execute(
            "SELECT id FROM accounts WHERE id = ?",
            (account_id,),
        ).fetchone()
        if account is None:
            raise HTTPException(status_code=404, detail="Account not found")
        rows = connection.execute("""
            SELECT * FROM reviews
            WHERE account_id = ?
            ORDER BY id DESC
        """, (account_id,)).fetchall()
        return [dict(row) for row in rows]

@app.post("/api/accounts/{account_id}/reviews", status_code=201)
def save_review(account_id: int, review: ReviewDecision):
    reviewer = review.reviewer.strip()
    note = review.note.strip()
    if not reviewer or not note:
        raise HTTPException(
            status_code=422,
            detail="Reviewer and note must contain text",
        )

    with closing(connect()) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        with connection:
            account = connection.execute(
                "SELECT id FROM accounts WHERE id = ?",
                (account_id,),
            ).fetchone()
            if account is None:
                raise HTTPException(status_code=404, detail="Account not found")

            cursor = connection.execute("""
                INSERT INTO reviews (
                    account_id, reviewer, decision, note, created_at
                ) VALUES (?, ?, ?, ?, ?)
            """, (
                account_id,
                reviewer,
                review.decision,
                note,
                datetime.now(timezone.utc).isoformat(),
            ))
            row = connection.execute(
                "SELECT * FROM reviews WHERE id = ?",
                (cursor.lastrowid,),
            ).fetchone()
            return dict(row)

import csv
import io
import sqlite3
from fastapi import UploadFile, File

class ImportedAccount(Account):
    department: str = Field(min_length=1, max_length=100)
    employment_status: Literal["active", "terminated"] = "active"

@app.post("/api/import/accounts", status_code=201)
async def import_accounts(file: UploadFile = File(...)):
    content = await file.read(1_048_577)
    await file.close()

    if len(content) > 1_048_576:
        raise HTTPException(413, "CSV must be 1 MB or smaller")

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(422, "Upload a UTF-8 encoded CSV")

    required = [
        "username", "department", "privileged", "mfa_enabled",
        "days_inactive", "employment_status",
    ]
    accounts = []
    errors = []
    seen = set()

    try:
        reader = csv.DictReader(io.StringIO(text, newline=""), strict=True)
        headers = reader.fieldnames
        if not headers or len(headers) != len(set(headers)):
            raise HTTPException(422, "CSV headers are missing or duplicated")
        if set(headers) != set(required):
            raise HTTPException(
                422,
                "CSV must contain exactly these columns: " + ", ".join(required),
            )

        for row_number, row in enumerate(reader, start=2):
            if row_number > 1001:
                raise HTTPException(422, "Maximum 1000 accounts per upload")

            try:
                if None in row or any(value is None for value in row.values()):
                    raise ValueError("Incorrect number of columns")

                values = {key: value.strip() for key, value in row.items()}
                for key in ("privileged", "mfa_enabled"):
                    value = values[key].lower()
                    if value not in ("true", "false", "1", "0"):
                        raise ValueError(
                            f"{key} must be true, false, 1, or 0"
                        )
                    values[key] = value in ("true", "1")

                if not values["days_inactive"].isascii() or not values["days_inactive"].isdigit():
                    raise ValueError("days_inactive must be a nonnegative whole number")
                values["days_inactive"] = int(values["days_inactive"])
                values["employment_status"] = values["employment_status"].lower()

                account = ImportedAccount(**values)
                if account.username in seen:
                    raise ValueError("Duplicate username within this CSV")
                seen.add(account.username)
                accounts.append(account)
            except ValueError as exc:
                errors.append({
                    "row": row_number,
                    "message": str(exc),
                })
    except csv.Error:
        raise HTTPException(422, "Malformed CSV. Check quotes and separators.")

    if errors:
        raise HTTPException(
            422,
            {"message": "Nothing imported. Fix invalid rows.", "errors": errors[:10]},
        )
    if not accounts:
        raise HTTPException(422, "CSV contains no account records")

    try:
        with closing(connect()) as connection:
            with connection:
                connection.executemany("""
                    INSERT INTO accounts (
                        username, department, privileged, mfa_enabled,
                        days_inactive, employment_status
                    ) VALUES (?, ?, ?, ?, ?, ?)
                """, [
                    (
                        account.username,
                        account.department,
                        int(account.privileged),
                        int(account.mfa_enabled),
                        account.days_inactive,
                        account.employment_status,
                    )
                    for account in accounts
                ])
    except sqlite3.IntegrityError:
        raise HTTPException(
            409,
            "A username already exists. Nothing imported; use unique usernames.",
        )

    return {"imported": len(accounts), "message": "Accounts imported successfully"}
