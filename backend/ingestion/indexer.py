import hashlib
import zipfile
import io
import threading
import uuid
from pathlib import Path

import chromadb
from chromadb.utils.embedding_functions import DefaultEmbeddingFunction
from django.conf import settings

from .parser import parse_file, is_indexable, CodeChunk

_tasks: dict[str, dict] = {}
_tasks_lock = threading.Lock()

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


def _get_collection(session_id: str) -> chromadb.Collection:
    return _get_client().get_or_create_collection(
        name=_collection_name(session_id),
        embedding_function=DefaultEmbeddingFunction(),
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


# ── Background tasks ──────────────────────────────────────────────────────────

def _update_task(task_id: str, **kwargs) -> None:
    with _tasks_lock:
        _tasks[task_id].update(kwargs)


def _run_index_zip(task_id: str, zip_bytes: bytes, session_id: str) -> None:
    try:
        _update_task(task_id, status="parsing")
        all_chunks: list[CodeChunk] = []
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            info_map = {i.filename: i.file_size for i in zf.infolist()}
            names = [n for n in zf.namelist() if is_indexable(n, info_map.get(n, 0))]
            _update_task(task_id, status="parsing", total=len(names))
            for name in names:
                try:
                    source = zf.read(name).decode("utf-8", errors="ignore")
                    all_chunks.extend(parse_file(source, str(Path(name))))
                except Exception:
                    continue

        if not all_chunks:
            _update_task(task_id, status="error", error="No indexable code found in this ZIP. Make sure it contains .py, .js, .ts, .java, .go, or similar source files.")
            return

        _update_task(task_id, status="embedding", total=len(all_chunks))
        indexed = _batch_upsert(all_chunks, session_id)
        _update_task(task_id, status="done", indexed=indexed, total=indexed)
    except zipfile.BadZipFile:
        _update_task(task_id, status="error", error="Invalid or corrupted ZIP file.")
    except Exception as exc:
        _update_task(task_id, status="error", error=str(exc))


def _run_index_file(task_id: str, source: str, filename: str, session_id: str) -> None:
    try:
        _update_task(task_id, status="parsing")
        chunks = parse_file(source, filename)
        if not chunks:
            _update_task(task_id, status="error", error="No indexable code found in this file.")
            return
        _update_task(task_id, status="embedding", total=len(chunks))
        indexed = _batch_upsert(chunks, session_id)
        _update_task(task_id, status="done", indexed=indexed, total=indexed)
    except Exception as exc:
        _update_task(task_id, status="error", error=str(exc))


# ── Public API ────────────────────────────────────────────────────────────────

def start_index_zip(zip_bytes: bytes, session_id: str) -> str:
    task_id = str(uuid.uuid4())
    with _tasks_lock:
        _tasks[task_id] = {"status": "queued", "indexed": 0, "total": 0, "error": ""}
    threading.Thread(target=_run_index_zip, args=(task_id, zip_bytes, session_id), daemon=True).start()
    return task_id


def start_reindex_zip(zip_bytes: bytes, session_id: str) -> str:
    """Wipes existing collection then re-indexes from scratch."""
    delete_session_collection(session_id)
    return start_index_zip(zip_bytes, session_id)


def start_index_file(source: str, filename: str, session_id: str) -> str:
    task_id = str(uuid.uuid4())
    with _tasks_lock:
        _tasks[task_id] = {"status": "queued", "indexed": 0, "total": 0, "error": ""}
    threading.Thread(target=_run_index_file, args=(task_id, source, filename, session_id), daemon=True).start()
    return task_id


def get_task_status(task_id: str) -> dict | None:
    with _tasks_lock:
        return dict(_tasks.get(task_id, {})) or None
