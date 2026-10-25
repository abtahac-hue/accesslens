import sqlite3
from contextlib import closing
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "accesslens.db"

def connect():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection

def initialize_database():
    with closing(connect()) as connection:
        with connection:
            connection.execute("""
                CREATE TABLE IF NOT EXISTS accounts (
                    id INTEGER PRIMARY KEY,
                    username TEXT NOT NULL UNIQUE,
                    department TEXT NOT NULL,
                    privileged INTEGER NOT NULL CHECK(privileged IN (0, 1)),
                    mfa_enabled INTEGER NOT NULL CHECK(mfa_enabled IN (0, 1)),
                    days_inactive INTEGER NOT NULL CHECK(days_inactive >= 0),
                    employment_status TEXT NOT NULL
                        CHECK(employment_status IN ('active', 'terminated'))
                )
            """)

            samples = [
                ("demo.admin", "IT", 1, 0, 120, "active"),
                ("demo.analyst", "Finance", 0, 1, 2, "active"),
                ("demo.manager", "Operations", 1, 1, 100, "active"),
                ("demo.support", "IT", 1, 0, 5, "active"),
                ("demo.assistant", "HR", 0, 1, 10, "active"),
                ("demo.auditor", "Finance", 0, 1, 1, "active"),
            ]

            connection.executemany("""
                INSERT OR IGNORE INTO accounts (
                    username, department, privileged, mfa_enabled,
                    days_inactive, employment_status
                ) VALUES (?, ?, ?, ?, ?, ?)
            """, samples)

def list_accounts():
    with closing(connect()) as connection:
        rows = connection.execute(
            "SELECT * FROM accounts ORDER BY username"
        ).fetchall()
        return [dict(row) for row in rows]
