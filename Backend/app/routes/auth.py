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


def _normalized_email(email: str) -> str:
    return email.strip().lower()


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: UserCreate):
    """Create a new user account and return a JWT."""
    email = _normalized_email(body.email)
    logger.info("Auth register attempt email=%s", email)

    if not _EMAIL_RE.match(email):
        logger.warning("Auth register rejected invalid email format email=%s", email)
        raise HTTPException(status_code=422, detail="Invalid email address")
    if len(body.password) < 8:
        logger.warning("Auth register rejected weak password email=%s", email)
        raise HTTPException(
            status_code=422, detail="Password must be at least 8 characters"
        )

    db = get_db()
    existing = await db.users.find_one({"email": email})
    if existing:
        logger.info("Auth register conflict existing user email=%s", email)
        raise HTTPException(
            status_code=409, detail="An account with this email already exists"
        )

    hashed = hash_password(body.password)
    doc = {
        "email": email,
        "name": body.name.strip() if body.name else "",
        "hashed_password": hashed,
        "created_at": datetime.now(UTC).isoformat(),
    }
    result = await db.users.insert_one(doc)
    user_id = str(result.inserted_id)

    token = create_access_token(user_id, email)
    logger.info("Auth register success email=%s user_id=%s", email, user_id)
    return TokenResponse(
        access_token=token,
        user=UserOut(id=user_id, email=email, name=body.name or ""),
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin):
    """Authenticate with email + password and return a JWT."""
    email = _normalized_email(body.email)
    logger.info("Auth login attempt email=%s", email)

    db = get_db()
    try:
        user = await db.users.find_one({"email": email})
    except Exception as exc:
        logger.exception("Auth login db error email=%s error=%s", email, exc)
        raise HTTPException(
            status_code=503, detail="Authentication service unavailable"
        ) from exc

    stored_hash = user.get("hashed_password") if user else None
    if not user or not isinstance(stored_hash, str) or not stored_hash:
        logger.warning("Auth login failed missing user/hash email=%s", email)
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    try:
        valid_password = verify_password(body.password, stored_hash)
    except Exception as exc:
        logger.warning("Auth login invalid hash format email=%s error=%s", email, exc)
        valid_password = False

    if not valid_password:
        logger.info("Auth login failed invalid credentials email=%s", email)
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    user_id = str(user["_id"])
    try:
        token = create_access_token(user_id, user["email"])
    except Exception as exc:
        logger.exception("Auth login token creation failed email=%s error=%s", email, exc)
        raise HTTPException(status_code=500, detail="Failed to create access token") from exc

    logger.info("Auth login success email=%s user_id=%s", email, user_id)

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
