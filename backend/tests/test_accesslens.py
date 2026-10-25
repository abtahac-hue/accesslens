import csv
import io

import pytest
from fastapi.testclient import TestClient
from backend import database
from backend import main


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "test.db")
    database.initialize_database()
    main.initialize_reviews()
    with TestClient(main.app) as test_client:
        yield test_client


@pytest.mark.parametrize(
    "privileged,mfa,days,expected",
    [
        (False, True, 0, []),
        (True, True, 89, []),
        (True, True, 90, ["DORMANT_PRIVILEGED"]),
        (True, True, 120, ["DORMANT_PRIVILEGED"]),
        (True, False, 0, ["PRIVILEGED_NO_MFA"]),
        (True, False, 90, ["PRIVILEGED_NO_MFA", "DORMANT_PRIVILEGED"]),
        (False, False, 120, []),
    ],
)
def test_risk_rules(client, privileged, mfa, days, expected):
    response = client.post("/api/analyze", json={
        "username": "test.user",
        "privileged": privileged,
        "mfa_enabled": mfa,
        "days_inactive": days,
    })
    assert response.status_code == 200
    result = response.json()
    assert [finding["rule"] for finding in result["findings"]] == expected
    assert result["requires_review"] == bool(expected)


def upload(client, rows):
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow([
        "username", "department", "privileged", "mfa_enabled",
        "days_inactive", "employment_status",
    ])
    writer.writerows(rows)
    return client.post("/api/import/accounts", files={
        "file": ("test.csv", output.getvalue().encode(), "text/csv"),
    })


def inventory(client):
    return client.get("/api/accounts").json()


def test_valid_import_is_saved_and_analyzed(client):
    response = upload(client, [
        ["test.new", "Finance", "true", "false", "100", "active"],
    ])
    assert response.status_code == 201
    result = inventory(client)
    assert result["total_accounts"] == 7
    account = next(a for a in result["accounts"] if a["username"] == "test.new")
    assert len(account["findings"]) == 2


def test_invalid_row_rejects_entire_upload(client):
    before = inventory(client)["total_accounts"]
    response = upload(client, [
        ["test.valid", "IT", "true", "true", "1", "active"],
        ["test.invalid", "IT", "maybe", "true", "1", "active"],
    ])
    assert response.status_code == 422
    assert inventory(client)["total_accounts"] == before


def test_existing_username_rolls_back_entire_upload(client):
    before = inventory(client)["total_accounts"]
    response = upload(client, [
        ["test.rollback", "IT", "false", "true", "1", "active"],
        ["demo.admin", "IT", "true", "true", "1", "active"],
    ])
    assert response.status_code == 409
    result = inventory(client)
    assert result["total_accounts"] == before
    assert not any(a["username"] == "test.rollback" for a in result["accounts"])


def test_review_persists_without_changing_findings(client):
    before = inventory(client)
    response = client.post("/api/accounts/1/reviews", json={
        "reviewer": "Test Reviewer",
        "decision": "investigation_required",
        "note": "Confirm access need and request MFA.",
    })
    assert response.status_code == 201
    saved = response.json()
    assert saved["created_at"]

    history = client.get("/api/accounts/1/reviews")
    assert history.status_code == 200
    assert history.json()[0]["id"] == saved["id"]
    assert inventory(client) == before


@pytest.mark.parametrize("decision,note", [
    ("invalid_decision", "Check access."),
    ("approved", "   "),
])
def test_invalid_review_is_not_saved(client, decision, note):
    response = client.post("/api/accounts/1/reviews", json={
        "reviewer": "Test Reviewer",
        "decision": decision,
        "note": note,
    })
    assert response.status_code == 422
    assert client.get("/api/accounts/1/reviews").json() == []


def test_missing_account_returns_404(client):
    response = client.get("/api/accounts/99999/reviews")
    assert response.status_code == 404


def test_negative_inactivity_rejected(client):
    response = client.post("/api/analyze", json={
        "username": "test.user",
        "days_inactive": -1,
    })
    assert response.status_code == 422
