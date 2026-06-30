from django.urls import path
from .views import SessionListView, SessionDetailView, QueryView, stream_query_view, login_view, signup_view

urlpatterns = [
    path("auth/login/", login_view, name="login"),
    path("auth/signup/", signup_view, name="signup"),
    path("query/", QueryView.as_view(), name="query"),
    path("query/stream/", stream_query_view, name="query-stream"),
    path("sessions/", SessionListView.as_view(), name="sessions"),
    path("sessions/<str:session_id>/", SessionDetailView.as_view(), name="session-detail"),
]
