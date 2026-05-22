from __future__ import annotations

import hashlib
import secrets
from typing import Any
from uuid import uuid4

from fastapi import Cookie, FastAPI, HTTPException, Request, Response, status
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

app = FastAPI()
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

# In-memory storage (no DB). Users own their notes.
# users[username] = {"password": "<hash>", "notes": [ ... ]}
users: dict[str, dict[str, Any]] = {}

# Session storage in memory.
# sessions[session_token] = username
sessions: dict[str, str] = {}

SESSION_COOKIE = "notes_session"


class AuthPayload(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=3, max_length=128)


class RegisterPayload(AuthPayload):
    confirm_password: str = Field(min_length=3, max_length=128)


class NotePayload(BaseModel):
    id: str | None = None
    title: str = Field(default="NOTE", max_length=64)
    content: str = Field(default="", max_length=10000)
    x: float = 12
    y: float = 12
    width: float = 300
    height: float = 210
    collapsed: bool = False


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def get_username_or_401(session_token: str | None) -> str:
    # User session is stored by cookie token -> username in sessions dict.
    if not session_token or session_token not in sessions:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return sessions[session_token]


@app.get("/")
def home(request: Request):
    return templates.TemplateResponse(request=request, name="index.html", context={})


@app.post("/register")
def register(payload: RegisterPayload):
    username = payload.username.strip().lower()
    if payload.password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    if username in users:
        raise HTTPException(status_code=409, detail="Username already exists")

    users[username] = {
        "password": hash_password(payload.password),
        # Notes are attached to user here.
        "notes": [],
    }
    return {"ok": True}


@app.post("/login")
def login(payload: AuthPayload, response: Response):
    username = payload.username.strip().lower()
    user = users.get(username)
    if not user or user["password"] != hash_password(payload.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = secrets.token_urlsafe(32)
    sessions[token] = username
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=60 * 60 * 24 * 7,
    )
    return {"ok": True, "username": username}


@app.post("/logout")
def logout(response: Response, notes_session: str | None = Cookie(default=None)):
    if notes_session and notes_session in sessions:
        sessions.pop(notes_session, None)
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


@app.get("/notes")
def get_notes(notes_session: str | None = Cookie(default=None)):
    username = get_username_or_401(notes_session)
    return {"notes": users[username]["notes"], "username": username}


@app.post("/notes")
def save_note(payload: NotePayload, notes_session: str | None = Cookie(default=None)):
    username = get_username_or_401(notes_session)
    note = payload.model_dump()
    note["title"] = note["title"].strip()[:64] or "NOTE"

    user_notes = users[username]["notes"]

    if note["id"]:
        for idx, existing in enumerate(user_notes):
            if existing["id"] == note["id"]:
                user_notes[idx] = note
                return {"ok": True, "note": note, "updated": True}

    note["id"] = str(uuid4())
    user_notes.append(note)
    return {"ok": True, "note": note, "updated": False}


@app.delete("/notes/{note_id}")
def delete_note(note_id: str, notes_session: str | None = Cookie(default=None)):
    username = get_username_or_401(notes_session)
    user_notes = users[username]["notes"]

    before = len(user_notes)
    users[username]["notes"] = [note for note in user_notes if note["id"] != note_id]
    if len(users[username]["notes"]) == before:
        raise HTTPException(status_code=404, detail="Note not found")

    return {"ok": True}
