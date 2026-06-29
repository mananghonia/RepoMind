from typing import TypedDict, Annotated
import operator


class AgentState(TypedDict):
    session_id: str
    question: str
    rewritten_question: str
    chat_history: list[dict]
    chunks: list[dict]
    grade: str
    answer: str
    citations: list[dict]
    retry_count: Annotated[int, operator.add]
