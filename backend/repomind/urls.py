from django.urls import path, include

urlpatterns = [
    path("api/", include("ingestion.urls")),
    path("api/", include("agent.urls")),
    path("api/", include("chat.urls")),
]
