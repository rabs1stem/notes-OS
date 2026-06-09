import uuid

from fastapi.testclient import TestClient
from app.backend.main import app

client = TestClient(app)


def test_register_user():
    username = f"test-{uuid.uuid4()}"

    response = client.post(
        "/register",
        json={
            "username": username,
            "password": "password123",
            "confirm_password": "password123",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}