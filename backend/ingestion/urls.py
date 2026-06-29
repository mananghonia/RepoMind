from django.urls import path
from .views import UploadView, UploadStatusView, ReindexView, FilesView

urlpatterns = [
    path("upload/", UploadView.as_view(), name="upload"),
    path("upload/status/<str:task_id>/", UploadStatusView.as_view(), name="upload-status"),
    path("sessions/<str:session_id>/reindex/", ReindexView.as_view(), name="reindex"),
    path("sessions/<str:session_id>/files/", FilesView.as_view(), name="session-files"),
]
