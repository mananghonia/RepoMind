from __future__ import annotations

import jwt
from datetime import datetime, timedelta, timezone

from django.conf import settings


def create_token() -> str:
    payload = {
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def verify_token(token: str) -> bool:
    try:
        jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return True
    except jwt.PyJWTError:
        return False
