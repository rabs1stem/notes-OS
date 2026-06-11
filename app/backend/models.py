from sqlalchemy import Boolean
from sqlalchemy import Column
from sqlalchemy import Float
from sqlalchemy import ForeignKey
from sqlalchemy import Integer
from sqlalchemy import String
from sqlalchemy.orm import relationship

from .database import Base


class User(Base):

    __tablename__ = "users"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    username = Column(
        String,
        unique=True,
        nullable=False
    )

    password_hash = Column(
        String,
        nullable=False
    )

    theme = Column(
        String,
        nullable=False,
        default="monitor",
        server_default="monitor"
    )

    # relationship:
    # user.notes -> all notes of this user
    notes = relationship(
        "Note",
        back_populates="owner",
        cascade="all, delete"
    )


class Note(Base):

    __tablename__ = "notes"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False
    )

    title = Column(
        String,
        default="NOTE"
    )

    content = Column(
        String,
        default=""
    )

    x = Column(
        Float,
        default=12
    )

    y = Column(
        Float,
        default=12
    )

    width = Column(
        Float,
        default=300
    )

    height = Column(
        Float,
        default=210
    )

    collapsed = Column(
        Boolean,
        default=False
    )

    # note.owner -> user object
    owner = relationship(
        "User",
        back_populates="notes"
    )