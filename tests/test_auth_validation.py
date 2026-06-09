from fastapi.testclient import TestClient
from app.backend.main import app

client = TestClient(app)


def test_register_passwords_must_match():
    response = client.post(
        "/register",
        json={
            "username": "alex",
            "password": "123456",
            "confirm_password": "654321"
        }
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Passwords do not match"