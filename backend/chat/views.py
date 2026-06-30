import json

from django.core.cache import cache
from django.http import StreamingHttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.views import APIView
from rest_framework.response import Response

from .auth import create_token, hash_password, verify_password
from .db import get_user, create_user, user_exists


@csrf_exempt
def login_view(request):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed."}, status=405)
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON."}, status=400)
    username = data.get("username", "").strip()
    password = data.get("password", "")
    if not username or not password:
        return JsonResponse({"error": "Username and password are required."}, status=400)
    user = get_user(username)
    if not user or not verify_password(password, user["password_hash"]):
        return JsonResponse({"error": "Invalid username or password."}, status=401)
    return JsonResponse({"token": create_token(user["username"]), "username": user["username"]})


@csrf_exempt
def signup_view(request):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed."}, status=405)
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON."}, status=400)
    username = data.get("username", "").strip()
    password = data.get("password", "")
    if not username or not password:
        return JsonResponse({"error": "Username and password are required."}, status=400)
    if len(username) < 3:
        return JsonResponse({"error": "Username must be at least 3 characters."}, status=400)
    if len(password) < 6:
        return JsonResponse({"error": "Password must be at least 6 characters."}, status=400)
    if user_exists(username):
        return JsonResponse({"error": "Username already taken."}, status=409)
    create_user(username, hash_password(password))
    return JsonResponse({"token": create_token(username), "username": username}, status=201)

def _is_rate_limited(request, limit=20, window=60):
    ip = request.META.get("HTTP_X_FORWARDED_FOR", request.META.get("REMOTE_ADDR", "unknown")).split(",")[0].strip()
    key = f"rl:{ip}"
    count = cache.get(key, 0)
    if count >= limit:
        return True
    cache.set(key, count + 1, timeout=window)
    return False


from agent.graph import run_agent, stream_agent
from ingestion.indexer import delete_session_collection
from .db import (
    create_session, get_session, list_sessions,
    append_message, delete_session, rename_session, auto_title_session,
)


class SessionListView(APIView):
    def get(self, request):
        try:
            return Response(list_sessions())
        except Exception as exc:
            return Response({"error": f"Database error: {exc}"}, status=503)

    def post(self, request):
        try:
            title = request.data.get("title", "New chat")
            return Response(create_session(title), status=201)
        except Exception as exc:
            return Response({"error": f"Database error: {exc}"}, status=503)


class SessionDetailView(APIView):
    def get(self, request, session_id):
        try:
            session = get_session(session_id)
        except Exception as exc:
            return Response({"error": f"Database error: {exc}"}, status=503)
        if not session:
            return Response({"error": "Session not found."}, status=404)
        return Response(session)

    def patch(self, request, session_id):
        title = request.data.get("title", "").strip()
        if not title:
            return Response({"error": "title is required."}, status=400)
        try:
            if rename_session(session_id, title):
                return Response({"id": session_id, "title": title})
        except Exception as exc:
            return Response({"error": f"Database error: {exc}"}, status=503)
        return Response({"error": "Session not found."}, status=404)

    def delete(self, request, session_id):
        try:
            if delete_session(session_id):
                delete_session_collection(session_id)
                return Response(status=204)
        except Exception as exc:
            return Response({"error": f"Database error: {exc}"}, status=503)
        return Response({"error": "Session not found."}, status=404)


class QueryView(APIView):
    def post(self, request):
        if _is_rate_limited(request):
            return Response({"error": "Rate limit exceeded. Please wait a moment."}, status=429)
        question = request.data.get("question", "").strip()
        session_id = request.data.get("session_id")
        if not question:
            return Response({"error": "question is required."}, status=400)
        if not session_id:
            return Response({"error": "session_id is required."}, status=400)
        try:
            session = get_session(session_id)
        except Exception as exc:
            return Response({"error": f"Database error: {exc}"}, status=503)
        if not session:
            return Response({"error": "Session not found."}, status=404)

        history = session.get("messages", [])[-10:]
        chat_history = [{"role": m["role"], "content": m["content"]} for m in history]
        try:
            result = run_agent(question=question, session_id=session_id, chat_history=chat_history)
        except Exception as exc:
            return Response({"error": f"Agent error: {exc}"}, status=500)

        try:
            append_message(session_id, "user", question)
            append_message(session_id, "assistant", result["answer"], result["citations"])
            if len(history) == 0:
                auto_title_session(session_id, question)
        except Exception:
            pass  # best-effort save

        return Response({
            "session_id": session_id,
            "answer": result["answer"],
            "citations": result["citations"],
            "chunks_used": len(result["citations"]),
        })


@csrf_exempt
def stream_query_view(request):
    if _is_rate_limited(request):
        return JsonResponse({"error": "Rate limit exceeded. Please wait a moment."}, status=429)

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

    try:
        session = get_session(session_id)
    except Exception as exc:
        return JsonResponse({"error": f"Database unavailable: {exc}"}, status=503)

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
            # Map common errors to user-friendly messages
            msg = str(exc)
            if "rate_limit" in msg.lower() or "429" in msg:
                msg = "Claude API rate limit reached. Please wait a moment and try again."
            elif "authentication" in msg.lower() or "401" in msg:
                msg = "Claude API key error. Please contact support."
            elif "overloaded" in msg.lower() or "529" in msg:
                msg = "Claude API is overloaded. Please try again in a few seconds."
            yield f"data: {json.dumps({'type': 'error', 'content': msg})}\n\n"
            return

        # Best-effort message persistence — don't let DB errors surface to the client
        try:
            append_message(session_id, "user", question)
            append_message(session_id, "assistant", full_answer, citations)
            if is_first:
                auto_title_session(session_id, question)
        except Exception:
            pass

    resp = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
    resp["Cache-Control"] = "no-cache"
    resp["X-Accel-Buffering"] = "no"
    resp["Access-Control-Allow-Origin"] = "*"
    return resp
