from __future__ import annotations

import uuid
from datetime import datetime, timezone

from pymongo import MongoClient
from django.conf import settings

_client: MongoClient | None = None


def _get_db():
    global _client
    if _client is None:
        _client = MongoClient(settings.MONGODB_URI)
    return _client[settings.MONGODB_DB_NAME]


def _sessions():
    return _get_db()["sessions"]


# ── Session CRUD ──────────────────────────────────────────────────────────────

def create_session(title: str = "New chat", owner: str = "") -> dict:
    doc = {
        "_id": str(uuid.uuid4()),
        "owner": owner,
        "title": title,
        "messages": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    _sessions().insert_one(doc)
    return _clean(doc)


def get_session(session_id: str, owner: str = "") -> dict | None:
    query: dict = {"_id": session_id}
    if owner:
        query["owner"] = owner
    doc = _sessions().find_one(query)
    return _clean(doc) if doc else None


def list_sessions(owner: str = "") -> list[dict]:
    query: dict = {"owner": owner} if owner else {}
    docs = _sessions().find(query, {"messages": 0}).sort("updated_at", -1).limit(50)
    return [_clean(d) for d in docs]


def append_message(session_id: str, role: str, content: str, citations: list | None = None) -> dict:
    msg = {
        "role": role,
        "content": content,
        "citations": citations or [],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _sessions().update_one(
        {"_id": session_id},
        {
            "$push": {"messages": msg},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()},
        },
    )
    return msg


def delete_session(session_id: str, owner: str = "") -> bool:
    query: dict = {"_id": session_id}
    if owner:
        query["owner"] = owner
    result = _sessions().delete_one(query)
    return result.deleted_count > 0


def rename_session(session_id: str, title: str, owner: str = "") -> bool:
    query: dict = {"_id": session_id}
    if owner:
        query["owner"] = owner
    result = _sessions().update_one(
        query,
        {"$set": {"title": title, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return result.matched_count > 0


def auto_title_session(session_id: str, question: str) -> None:
    title = question[:60] + ("…" if len(question) > 60 else "")
    _sessions().update_one({"_id": session_id}, {"$set": {"title": title}})


def _clean(doc: dict) -> dict:
    doc["id"] = doc.pop("_id")
    return doc


# ── User management ───────────────────────────────────────────────────────────

def _users():
    return _get_db()["users"]


def create_user(username: str, password_hash: str) -> None:
    _users().insert_one({
        "_id": username.lower(),
        "username": username,
        "password_hash": password_hash,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


def get_user(username: str) -> dict | None:
    return _users().find_one({"_id": username.lower()})


def user_exists(username: str) -> bool:
    return _users().count_documents({"_id": username.lower()}) > 0


def set_suggested_questions(session_id: str, questions: list[str]) -> None:
    _sessions().update_one(
        {"_id": session_id},
        {"$set": {"suggested_questions": questions}},
    )


# ── Task persistence ──────────────────────────────────────────────────────────

def _tasks():
    return _get_db()["tasks"]


def create_task(task_id: str) -> None:
    _tasks().insert_one({
        "_id": task_id,
        "status": "queued",
        "indexed": 0,
        "total": 0,
        "error": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


def update_task(task_id: str, **kwargs) -> None:
    _tasks().update_one({"_id": task_id}, {"$set": kwargs})


def get_task(task_id: str) -> dict | None:
    doc = _tasks().find_one({"_id": task_id})
    if not doc:
        return None
    doc.pop("_id")
    doc.pop("created_at", None)
    return doc
