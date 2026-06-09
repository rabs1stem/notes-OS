from fastapi.testclient import TestClient
from app.backend.main import app

client = TestClient(app)


def test_get_notes_without_auth():
    response = client.get("/notes")

    assert response.status_code == 401


def test_create_note_without_auth():
    response = client.post(
        "/notes",
        json={
            "title": "test",
            "content": "hello",
            "x": 0,
            "y": 0,
            "width": 200,
            "height": 200,
            "collapsed": False
        }
    )

    assert response.status_code == 401