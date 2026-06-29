import json

from django.http import StreamingHttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.views import APIView
from rest_framework.response import Response

from agent.graph import run_agent, stream_agent
from ingestion.indexer import delete_session_collection
from .db import (
    create_session, get_session, list_sessions,
    append_message, delete_session, rename_session, auto_title_session,
)


class SessionListView(APIView):
    def get(self, request):
        return Response(list_sessions())

    def post(self, request):
        title = request.data.get("title", "New chat")
        return Response(create_session(title), status=201)


class SessionDetailView(APIView):
    def get(self, request, session_id):
        session = get_session(session_id)
        if not session:
            return Response({"error": "Session not found."}, status=404)
        return Response(session)

    def patch(self, request, session_id):
        title = request.data.get("title", "").strip()
        if not title:
            return Response({"error": "title is required."}, status=400)
        if rename_session(session_id, title):
            return Response({"id": session_id, "title": title})
        return Response({"error": "Session not found."}, status=404)

    def delete(self, request, session_id):
        if delete_session(session_id):
            delete_session_collection(session_id)
            return Response(status=204)
        return Response({"error": "Session not found."}, status=404)


class QueryView(APIView):
    def post(self, request):
        question = request.data.get("question", "").strip()
        session_id = request.data.get("session_id")
        if not question:
            return Response({"error": "question is required."}, status=400)
        if not session_id:
            return Response({"error": "session_id is required."}, status=400)
        session = get_session(session_id)
        if not session:
            return Response({"error": "Session not found."}, status=404)

        history = session.get("messages", [])[-10:]
        chat_history = [{"role": m["role"], "content": m["content"]} for m in history]
        result = run_agent(question=question, session_id=session_id, chat_history=chat_history)
        append_message(session_id, "user", question)
        append_message(session_id, "assistant", result["answer"], result["citations"])
        if len(history) == 0:
            auto_title_session(session_id, question)
        return Response({
            "session_id": session_id,
            "answer": result["answer"],
            "citations": result["citations"],
            "chunks_used": len(result["citations"]),
        })


@csrf_exempt
def stream_query_view(request):
    """SSE streaming endpoint — returns tokens as they arrive from Claude."""
    if request.method == "OPTIONS":
        resp = JsonResponse({})
        resp["Access-Control-Allow-Origin"] = "*"
        resp["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        resp["Access-Control-Allow-Headers"] = "Content-Type"
        return resp

    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed."}, status=405)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON."}, status=400)

    question = data.get("question", "").strip()
    session_id = data.get("session_id")

    if not question:
        return JsonResponse({"error": "question is required."}, status=400)
    if not session_id:
        return JsonResponse({"error": "session_id is required."}, status=400)

    session = get_session(session_id)
    if not session:
        return JsonResponse({"error": "Session not found."}, status=404)

    history = session.get("messages", [])[-10:]
    chat_history = [{"role": m["role"], "content": m["content"]} for m in history]
    is_first = len(history) == 0

    def event_stream():
        full_answer = ""
        citations = []
        chunks_used = 0
        try:
            for event_type, payload in stream_agent(question, session_id, chat_history):
                if event_type == "token":
                    full_answer += payload
                    yield f"data: {json.dumps({'type': 'token', 'content': payload})}\n\n"
                elif event_type == "done":
                    citations = payload["citations"]
                    chunks_used = payload["chunks_used"]
                    yield f"data: {json.dumps({'type': 'done', 'citations': citations, 'chunks_used': chunks_used})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'content': str(exc)})}\n\n"
            return

        append_message(session_id, "user", question)
        append_message(session_id, "assistant", full_answer, citations)
        if is_first:
            auto_title_session(session_id, question)

    resp = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
    resp["Cache-Control"] = "no-cache"
    resp["X-Accel-Buffering"] = "no"
    resp["Access-Control-Allow-Origin"] = "*"
    return resp
