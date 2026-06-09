from __future__ import annotations

import hashlib
import os
import secrets

from fastapi import Cookie, Depends, FastAPI, HTTPException, Response, status
from redis import Redis
from redis.exceptions import RedisError
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .models import Note, User
from .schemas import AuthPayload, NotePayload, RegisterPayload

app = FastAPI()

SESSION_COOKIE = "notes_session"
SESSION_TTL_SECONDS = int(os.getenv("SESSION_TTL_SECONDS", str(60 * 60 * 24 * 7)))
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
redis_client = Redis.from_url(REDIS_URL, decode_responses=True)

# Ensure DB tables exist.
Base.metadata.create_all(bind=engine)


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def session_key(token: str) -> str:
    return f"session:{token}"


def save_session(token: str, username: str) -> None:
    try:
        redis_client.setex(session_key(token), SESSION_TTL_SECONDS, username)
    except RedisError as exc:
        raise HTTPException(status_code=503, detail="Session store unavailable") from exc


def load_session_username(token: str) -> str | None:
    try:
        return redis_client.get(session_key(token))
    except RedisError as exc:
        raise HTTPException(status_code=503, detail="Session store unavailable") from exc


def delete_session(token: str) -> None:
    try:
        redis_client.delete(session_key(token))
    except RedisError:
        pass


def get_username_or_401(session_token: str | None) -> str:
    if not session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    username = load_session_username(session_token)
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return username


def get_user_or_401(notes_session: str | None, db: Session) -> User:
    username = get_username_or_401(notes_session)
    user = db.query(User).filter(User.username == username).first()
    if not user:
        # Session token can become stale if user row was removed.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user



@app.post("/register")
def register(payload: RegisterPayload, db: Session = Depends(get_db)):
    username = payload.username.strip().lower()
    if payload.password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    existing = db.query(User).filter(User.username == username).first()
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists")

    new_user = User(username=username, password_hash=hash_password(payload.password))
    db.add(new_user)
    db.commit()

    return {"ok": True}


@app.post("/login")
def login(payload: AuthPayload, response: Response, db: Session = Depends(get_db)):
    username = payload.username.strip().lower()
    user = db.query(User).filter(User.username == username).first()
    if not user or user.password_hash != hash_password(payload.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = secrets.token_urlsafe(32)
    save_session(token, username)

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
    if notes_session:
        delete_session(notes_session)
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


@app.get("/notes")
def get_notes(notes_session: str | None = Cookie(default=None), db: Session = Depends(get_db)):
    user = get_user_or_401(notes_session, db)
    notes = db.query(Note).filter(Note.user_id == user.id).all()

    return {
        "notes": [
            {
                "id": note.id,
                "title": note.title,
                "content": note.content,
                "x": note.x,
                "y": note.y,
                "width": note.width,
                "height": note.height,
                "collapsed": note.collapsed,
            }
            for note in notes
        ],
        "username": user.username,
    }


@app.post("/notes")
def save_note(
    payload: NotePayload,
    notes_session: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_or_401(notes_session, db)

    title = payload.title.strip()[:64] or "NOTE"

    if payload.id is not None:
        note = db.query(Note).filter(Note.id == payload.id, Note.user_id == user.id).first()
        if note:
            note.title = title
            note.content = payload.content
            note.x = payload.x
            note.y = payload.y
            note.width = payload.width
            note.height = payload.height
            note.collapsed = payload.collapsed
            db.commit()
            db.refresh(note)
            return {
                "ok": True,
                "updated": True,
                "note": {
                    "id": note.id,
                    "title": note.title,
                    "content": note.content,
                    "x": note.x,
                    "y": note.y,
                    "width": note.width,
                    "height": note.height,
                    "collapsed": note.collapsed,
                },
            }

    note = Note(
        user_id=user.id,
        title=title,
        content=payload.content,
        x=payload.x,
        y=payload.y,
        width=payload.width,
        height=payload.height,
        collapsed=payload.collapsed,
    )
    db.add(note)
    db.commit()
    db.refresh(note)

    return {
        "ok": True,
        "updated": False,
        "note": {
            "id": note.id,
            "title": note.title,
            "content": note.content,
            "x": note.x,
            "y": note.y,
            "width": note.width,
            "height": note.height,
            "collapsed": note.collapsed,
        },
    }


@app.delete("/notes/{note_id}")
def delete_note(note_id: int, notes_session: str | None = Cookie(default=None), db: Session = Depends(get_db)):
    user = get_user_or_401(notes_session, db)
    note = db.query(Note).filter(Note.id == note_id, Note.user_id == user.id).first()

    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    db.delete(note)
    db.commit()
    return {"ok": True}

@app.get("/health")
def health():
    return {"status": "ok"}