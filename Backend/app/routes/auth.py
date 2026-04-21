import logging
import re
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException

from app.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.database import get_db
from app.models import TokenResponse, UserCreate, UserLogin, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: UserCreate):
    """Create a new user account and return a JWT."""
    if not _EMAIL_RE.match(body.email):
        raise HTTPException(status_code=422, detail="Invalid email address")
    if len(body.password) < 8:
        raise HTTPException(
            status_code=422, detail="Password must be at least 8 characters"
        )

    db = get_db()
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(
            status_code=409, detail="An account with this email already exists"
        )

    hashed = hash_password(body.password)
    doc = {
        "email": body.email.lower(),
        "name": body.name.strip() if body.name else "",
        "hashed_password": hashed,
        "created_at": datetime.now(UTC).isoformat(),
    }
    result = await db.users.insert_one(doc)
    user_id = str(result.inserted_id)

    token = create_access_token(user_id, body.email.lower())
    return TokenResponse(
        access_token=token,
        user=UserOut(id=user_id, email=body.email.lower(), name=body.name or ""),
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin):
    """Authenticate with email + password and return a JWT."""
    db = get_db()
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    user_id = str(user["_id"])
    token = create_access_token(user_id, user["email"])
    return TokenResponse(
        access_token=token,
        user=UserOut(id=user_id, email=user["email"], name=user.get("name", "")),
    )


@router.get("/me", response_model=UserOut)
async def me(current_user: dict = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return UserOut(
        id=str(current_user["_id"]),
        email=current_user["email"],
        name=current_user.get("name", ""),
    )
