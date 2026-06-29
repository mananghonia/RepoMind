from __future__ import annotations

import hashlib
import zipfile
import io
import threading
import uuid
from pathlib import Path

import chromadb
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
from django.conf import settings

from .parser import parse_file, is_indexable, CodeChunk
from chat.db import create_task, update_task, get_task, set_suggested_questions

# Singleton ChromaDB client — thread-safe double-checked locking
_chroma_client: chromadb.PersistentClient | None = None
_chroma_client_lock = threading.Lock()

MAX_ZIP_BYTES = 100 * 1024 * 1024  # 100 MB


def _get_client() -> chromadb.PersistentClient:
    global _chroma_client
    if _chroma_client is None:
        with _chroma_client_lock:
            if _chroma_client is None:
                _chroma_client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
    return _chroma_client


# ── ChromaDB — per-session collections ───────────────────────────────────────

def _collection_name(session_id: str) -> str:
    return f"s{session_id.replace('-', '')}"


def _get_ef() -> OpenAIEmbeddingFunction:
    return OpenAIEmbeddingFunction(
        api_key=settings.OPENAI_API_KEY,
        model_name="text-embedding-3-small",
    )


def _get_collection(session_id: str) -> chromadb.Collection:
    return _get_client().get_or_create_collection(
        name=_collection_name(session_id),
        embedding_function=_get_ef(),
        metadata={"hnsw:space": "cosine"},
    )


def delete_session_collection(session_id: str) -> None:
    try:
        _get_client().delete_collection(_collection_name(session_id))
    except Exception:
        pass


def get_session_files(session_id: str) -> tuple[list[str], int]:
    """Return (sorted filenames, chunk count) for this session."""
    try:
        collection = _get_collection(session_id)
        count = collection.count()
        if count == 0:
            return [], 0
        results = collection.get(include=["metadatas"])
        return sorted({m["filename"] for m in results["metadatas"]}), count
    except Exception:
        return [], 0


def _chunk_id(chunk: CodeChunk) -> str:
    key = f"{chunk.filename}:{chunk.name}:{chunk.start_line}"
    return hashlib.md5(key.encode()).hexdigest()


# ── Batch upsert ──────────────────────────────────────────────────────────────

_BATCH_SIZE = 100


def _batch_upsert(chunks: list[CodeChunk], session_id: str) -> int:
    if not chunks:
        return 0
    collection = _get_collection(session_id)
    total = 0
    for i in range(0, len(chunks), _BATCH_SIZE):
        batch = chunks[i: i + _BATCH_SIZE]
        collection.upsert(
            documents=[c.code for c in batch],
            ids=[_chunk_id(c) for c in batch],
            metadatas=[
                {
                    "filename": c.filename,
                    "chunk_type": c.chunk_type,
                    "name": c.name,
                    "start_line": c.start_line,
                    "end_line": c.end_line,
                    "language": c.language,
                }
                for c in batch
            ],
        )
        total += len(batch)
    return total


# ── Query ─────────────────────────────────────────────────────────────────────

def retrieve_chunks(query: str, session_id: str, n_results: int = 5) -> list[dict]:
    """Returns chunks with an extra 'score' key (0 = identical, 1 = unrelated)."""
    try:
        collection = _get_collection(session_id)
        count = collection.count()
        if count == 0:
            return []
        results = collection.query(
            query_texts=[query],
            n_results=min(n_results, count),
            include=["documents", "metadatas", "distances"],
        )
        return [
            {"code": doc, "score": dist, **meta}
            for doc, meta, dist in zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0],
            )
        ]
    except Exception:
        return []


# ── Dynamic suggested questions ───────────────────────────────────────────────

def _generate_suggested_questions(chunks: list[CodeChunk], session_id: str) -> None:
    try:
        from langchain_anthropic import ChatAnthropic
        from langchain_core.messages import HumanMessage, SystemMessage

        seen_files: dict[str, list[str]] = {}
        for c in chunks:
            if c.filename not in seen_files:
                seen_files[c.filename] = []
            if c.name and len(seen_files[c.filename]) < 3:
                seen_files[c.filename].append(c.name)

        lines = [
            f"  {fname}: {', '.join(names) if names else '...'}"
            for fname, names in list(seen_files.items())[:20]
        ]

        llm = ChatAnthropic(
            model="claude-haiku-4-5-20251001",
            api_key=settings.ANTHROPIC_API_KEY,
            temperature=0.3,
            max_tokens=150,
        )
        resp = llm.invoke([
            SystemMessage(content=(
                "Generate exactly 3 short questions a developer would ask about this codebase. "
                "Each question must be under 10 words. Output only the 3 questions, one per line, no numbering or bullets."
            )),
            HumanMessage(content="Codebase files and functions:\n" + "\n".join(lines)),
        ])
        questions = [q.strip() for q in resp.content.strip().split("\n") if q.strip()][:3]
        if len(questions) == 3:
            set_suggested_questions(session_id, questions)
    except Exception:
        pass


# ── Background tasks ──────────────────────────────────────────────────────────

def _run_index_zip(task_id: str, zip_bytes: bytes, session_id: str) -> None:
    try:
        update_task(task_id, status="parsing")
        all_chunks: list[CodeChunk] = []
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            info_map = {i.filename: i.file_size for i in zf.infolist()}
            names = [n for n in zf.namelist() if is_indexable(n, info_map.get(n, 0))]
            update_task(task_id, status="parsing", total=len(names))
            for name in names:
                try:
                    source = zf.read(name).decode("utf-8", errors="ignore")
                    all_chunks.extend(parse_file(source, str(Path(name))))
                except Exception:
                    continue

        if not all_chunks:
            update_task(task_id, status="error", error="No indexable code found in this ZIP. Make sure it contains .py, .js, .ts, .java, .go, or similar source files.")
            return

        update_task(task_id, status="embedding", total=len(all_chunks))
        indexed = _batch_upsert(all_chunks, session_id)
        _generate_suggested_questions(all_chunks, session_id)
        update_task(task_id, status="done", indexed=indexed, total=indexed)
    except zipfile.BadZipFile:
        update_task(task_id, status="error", error="Invalid or corrupted ZIP file.")
    except Exception as exc:
        update_task(task_id, status="error", error=str(exc))


def _run_index_file(task_id: str, source: str, filename: str, session_id: str) -> None:
    try:
        update_task(task_id, status="parsing")
        chunks = parse_file(source, filename)
        if not chunks:
            update_task(task_id, status="error", error="No indexable code found in this file.")
            return
        update_task(task_id, status="embedding", total=len(chunks))
        indexed = _batch_upsert(chunks, session_id)
        _generate_suggested_questions(chunks, session_id)
        update_task(task_id, status="done", indexed=indexed, total=indexed)
    except Exception as exc:
        update_task(task_id, status="error", error=str(exc))


# ── Public API ────────────────────────────────────────────────────────────────

def start_index_zip(zip_bytes: bytes, session_id: str) -> str:
    task_id = str(uuid.uuid4())
    create_task(task_id)
    threading.Thread(target=_run_index_zip, args=(task_id, zip_bytes, session_id), daemon=True).start()
    return task_id


def start_reindex_zip(zip_bytes: bytes, session_id: str) -> str:
    """Wipes existing collection then re-indexes from scratch."""
    delete_session_collection(session_id)
    return start_index_zip(zip_bytes, session_id)


def start_index_file(source: str, filename: str, session_id: str) -> str:
    task_id = str(uuid.uuid4())
    create_task(task_id)
    threading.Thread(target=_run_index_file, args=(task_id, source, filename, session_id), daemon=True).start()
    return task_id


def get_task_status(task_id: str) -> dict | None:
    return get_task(task_id)
