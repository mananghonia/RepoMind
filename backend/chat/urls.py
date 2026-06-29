from django.urls import path
from .views import SessionListView, SessionDetailView, QueryView, stream_query_view

urlpatterns = [
    path("query/", QueryView.as_view(), name="query"),
    path("query/stream/", stream_query_view, name="query-stream"),
    path("sessions/", SessionListView.as_view(), name="sessions"),
    path("sessions/<str:session_id>/", SessionDetailView.as_view(), name="session-detail"),
]
