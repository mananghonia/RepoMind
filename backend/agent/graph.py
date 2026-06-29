from langgraph.graph import StateGraph, END

from .state import AgentState
from .nodes import (
    retrieve_node, grade_node, rewrite_node, generate_node,
    stream_generate_node, route_after_grade, MAX_RETRIES,
)

_compiled_graph = None


def build_graph():
    g = StateGraph(AgentState)
    g.add_node("retrieve", retrieve_node)
    g.add_node("grader", grade_node)
    g.add_node("rewrite", rewrite_node)
    g.add_node("generate", generate_node)
    g.set_entry_point("retrieve")
    g.add_edge("retrieve", "grader")
    g.add_conditional_edges(
        "grader",
        route_after_grade,
        {"generate": "generate", "rewrite": "rewrite"},
    )
    g.add_edge("rewrite", "retrieve")
    g.add_edge("generate", END)
    return g.compile()


def get_graph():
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_graph()
    return _compiled_graph


def run_agent(question: str, session_id: str, chat_history: list[dict] | None = None) -> dict:
    result = get_graph().invoke({
        "session_id": session_id,
        "question": question,
        "rewritten_question": "",
        "chat_history": chat_history or [],
        "chunks": [],
        "grade": "",
        "answer": "",
        "citations": [],
        "retry_count": 0,
    })
    return {"answer": result["answer"], "citations": result["citations"]}


def stream_agent(question: str, session_id: str, chat_history: list[dict] | None = None):
    """Runs retrieve/grade/rewrite synchronously, then streams generate tokens."""
    state: AgentState = {
        "session_id": session_id,
        "question": question,
        "rewritten_question": "",
        "chat_history": chat_history or [],
        "chunks": [],
        "grade": "",
        "answer": "",
        "citations": [],
        "retry_count": 0,
    }
    state.update(retrieve_node(state))
    state.update(grade_node(state))
    if state["grade"] == "irrelevant" and state.get("retry_count", 0) < MAX_RETRIES:
        state.update(rewrite_node(state))
        state.update(retrieve_node(state))
    yield from stream_generate_node(state)
