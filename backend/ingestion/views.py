from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, JSONParser

from chat.db import create_session, delete_session, get_session
from .indexer import (
    start_index_zip, start_index_file, start_reindex_zip,
    get_task_status, get_session_files, delete_session_collection, MAX_ZIP_BYTES,
)


class UploadView(APIView):
    parser_classes = [MultiPartParser, JSONParser]

    def post(self, request):
        owner = getattr(request, "user_id", "")
        session = create_session("Indexing…", owner=owner)
        session_id = session["id"]

        def _abort(msg, status=400):
            delete_session(session_id)
            delete_session_collection(session_id)
            return Response({"error": msg}, status=status)

        if "file" in request.FILES:
            f = request.FILES["file"]
            if not f.name.endswith(".zip"):
                return _abort("Only .zip files are accepted.")
            if f.size > MAX_ZIP_BYTES:
                mb = f.size // 1024 // 1024
                return _abort(f"ZIP too large ({mb} MB). Maximum is 250 MB.")
            task_id = start_index_zip(f.read(), session_id)
            return Response({"task_id": task_id, "session_id": session_id, "source": f.name}, status=202)

        source = request.data.get("source")
        filename = request.data.get("filename", "unnamed.py")
        if not source:
            return _abort("Provide a 'file' (ZIP) or 'source' + 'filename'.")
        task_id = start_index_file(source, filename, session_id)
        return Response({"task_id": task_id, "session_id": session_id, "source": filename}, status=202)


class UploadStatusView(APIView):
    def get(self, request, task_id):
        status = get_task_status(task_id)
        if status is None:
            return Response(
                {"error": "Task not found. The server may have restarted — please upload again."},
                status=404,
            )
        return Response(status)


class ReindexView(APIView):
    parser_classes = [MultiPartParser]

    def post(self, request, session_id):
        owner = getattr(request, "user_id", "")
        if not get_session(session_id, owner=owner):
            return Response({"error": "Session not found."}, status=404)
        if "file" not in request.FILES:
            return Response({"error": "No file provided."}, status=400)
        f = request.FILES["file"]
        if not f.name.endswith(".zip"):
            return Response({"error": "Only .zip files are accepted."}, status=400)
        if f.size > MAX_ZIP_BYTES:
            mb = f.size // 1024 // 1024
            return Response({"error": f"ZIP too large ({mb} MB). Maximum is 250 MB."}, status=400)
        task_id = start_reindex_zip(f.read(), session_id)
        return Response({"task_id": task_id}, status=202)


class FilesView(APIView):
    def get(self, request, session_id):
        owner = getattr(request, "user_id", "")
        if not get_session(session_id, owner=owner):
            return Response({"error": "Session not found."}, status=404)
        files, chunks = get_session_files(session_id)
        return Response({"files": files, "chunks": chunks})
