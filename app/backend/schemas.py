from pydantic import BaseModel
from pydantic import Field


class AuthPayload(BaseModel):

    username: str = Field(
        min_length=3,
        max_length=32
    )

    password: str = Field(
        min_length=3,
        max_length=128
    )


class RegisterPayload(AuthPayload):

    confirm_password: str = Field(
        min_length=3,
        max_length=128
    )


class NotePayload(BaseModel):

    id: int | None = None

    title: str = Field(
        default="NOTE",
        max_length=64
    )

    content: str = Field(
        default="",
        max_length=10000
    )

    x: float = 12
    y: float = 12

    width: float = 300
    height: float = 210

    collapsed: bool = False


class NoteResponse(NotePayload):

    id: int

    class Config:

        from_attributes = True

class ThemePayload(BaseModel):

    theme: str = Field(
        min_length=1,
        max_length=32
    )

