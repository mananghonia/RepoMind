from pathlib import Path
import os
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "django-insecure-dev-only-key")
DEBUG = os.environ.get("DJANGO_DEBUG", "False") == "True"

ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "ingestion",
    "agent",
    "chat",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
]

# CORS — accept from any origin in production (frontend URL set via env)
_cors_origins = os.environ.get("CORS_ALLOWED_ORIGINS", "")
if _cors_origins:
    CORS_ALLOWED_ORIGINS = [o.strip() for o in _cors_origins.split(",") if o.strip()]
else:
    CORS_ALLOW_ALL_ORIGINS = True   # dev fallback

CORS_ALLOW_HEADERS = [
    "accept", "accept-encoding", "authorization",
    "content-type", "dnt", "origin", "user-agent",
    "x-csrftoken", "x-requested-with",
]

# CSRF — required for HTTPS deployments
_csrf = os.environ.get("CSRF_TRUSTED_ORIGINS", "")
if _csrf:
    CSRF_TRUSTED_ORIGINS = [o.strip() for o in _csrf.split(",") if o.strip()]

ROOT_URLCONF = "repomind.urls"

TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "DIRS": [],
    "APP_DIRS": True,
    "OPTIONS": {"context_processors": []},
}]

WSGI_APPLICATION = "repomind.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
    ],
}

# External services
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
MONGODB_URI = os.environ.get("MONGODB_URI", "")
MONGODB_DB_NAME = os.environ.get("MONGODB_DB_NAME", "repomind")

# ChromaDB — use absolute path; Railway mounts persistent volume at /data
CHROMA_PERSIST_DIR = os.environ.get(
    "CHROMA_PERSIST_DIR",
    str(BASE_DIR / "chroma_db"),
)
