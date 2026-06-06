from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_register_user():
    response = client.post(
        "/register",
        json={
            "username": "testuser123",
            "password": "password123",
            "confirm_password": "password123"
        }
    )

    assert response.status_code == 200
    assert response.json()["ok"] is True