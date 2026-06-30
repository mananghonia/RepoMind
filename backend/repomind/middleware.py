from django.http import JsonResponse
from chat.auth import decode_token

_PUBLIC_PATHS = {"/api/auth/login/", "/api/auth/signup/", "/health/"}


class JWTAuthMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path in _PUBLIC_PATHS or request.method == "OPTIONS":
            return self.get_response(request)

        if request.path.startswith("/api/"):
            auth = request.META.get("HTTP_AUTHORIZATION", "")
            token = auth.removeprefix("Bearer ").strip()
            payload = decode_token(token) if token else None
            if not payload:
                return JsonResponse({"error": "Authentication required."}, status=401)
            request.user_id = payload.get("sub", "")

        return self.get_response(request)
