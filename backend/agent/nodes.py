from django.conf import settings
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from ingestion.indexer import retrieve_chunks
from .state import AgentState

_llm = None

_RELEVANCE_THRESHOLD = 0.55
MAX_RETRIES = 1


def _get_llm() -> ChatAnthropic:
    global _llm
    if _llm is None:
        _llm = ChatAnthropic(
            model="claude-sonnet-4-6",
            api_key=settings.ANTHROPIC_API_KEY,
            temperature=0,
        )
    return _llm


# ── Node 1: Retrieve ──────────────────────────────────────────────────────────

def retrieve_node(state: AgentState) -> dict:
    query = state.get("rewritten_question") or state["question"]
    chunks = retrieve_chunks(query, session_id=state["session_id"], n_results=5)
    return {"chunks": chunks}


# ── Node 2: Grade (cosine distance — zero API calls) ─────────────────────────

def grade_node(state: AgentState) -> dict:
    chunks = state["chunks"]
    if not chunks:
        return {"grade": "irrelevant"}
    best_score = min(c.get("score", 1.0) for c in chunks)
    return {"grade": "relevant" if best_score < _RELEVANCE_THRESHOLD else "irrelevant"}


# ── Node 3: Rewrite ───────────────────────────────────────────────────────────

_REWRITE_SYSTEM = """You are a query rewriter for a code-search system.
The previous query returned irrelevant results. Rewrite the query to be more
specific and technical so that a vector search over code embeddings will find
more relevant function or class definitions. Output only the rewritten query,
nothing else."""


def rewrite_node(state: AgentState) -> dict:
    messages = [
        SystemMessage(content=_REWRITE_SYSTEM),
        HumanMessage(content=f"Original query: {state['question']}"),
    ]
    response = _get_llm().invoke(messages)
    return {"rewritten_question": response.content.strip(), "retry_count": 1}


# ── Node 4: Generate (non-streaming) ─────────────────────────────────────────

_GENERATE_SYSTEM = """You are an expert code assistant. Answer the user's question
using ONLY the provided code chunks. Always cite the exact file and line range
in your answer using the format [filename:start-end]. If multiple chunks are
relevant, synthesise them. If the chunks do not contain enough information to
answer, say so honestly."""


def _build_citations(chunks: list[dict]) -> list[dict]:
    return [
        {
            "filename": c["filename"],
            "name": c.get("name", ""),
            "start_line": c["start_line"],
            "end_line": c["end_line"],
            "code": c["code"],
            "language": c.get("language", ""),
        }
        for c in chunks
    ]


def _build_prompt(state: AgentState) -> list:
    chunks = state["chunks"]
    chunks_text = "\n\n---\n\n".join(
        f"[{c['filename']}:{c['start_line']}-{c['end_line']}]\n```{c.get('language','')}\n{c['code']}\n```"
        for c in chunks
    )
    history_text = "".join(
        f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}\n"
        for m in state.get("chat_history", [])
    )
    user_content = (
        f"Conversation so far:\n{history_text}\n" if history_text else ""
    ) + f"Question: {state['question']}\n\nRelevant code:\n{chunks_text}"
    return [SystemMessage(content=_GENERATE_SYSTEM), HumanMessage(content=user_content)]


def generate_node(state: AgentState) -> dict:
    response = _get_llm().invoke(_build_prompt(state))
    return {
        "answer": response.content,
        "citations": _build_citations(state["chunks"]),
    }


# ── Node 4b: Generate (streaming) — used by stream_agent ─────────────────────

def stream_generate_node(state: AgentState):
    """Generator yielding ('token', str) then ('done', dict)."""
    for token in _get_llm().stream(_build_prompt(state)):
        yield "token", token.content

    yield "done", {
        "citations": _build_citations(state["chunks"]),
        "chunks_used": len(state["chunks"]),
    }


# ── Conditional edge ──────────────────────────────────────────────────────────

def route_after_grade(state: AgentState) -> str:
    if state["grade"] == "relevant":
        return "generate"
    if state.get("retry_count", 0) >= MAX_RETRIES:
        return "generate"
    return "rewrite"
