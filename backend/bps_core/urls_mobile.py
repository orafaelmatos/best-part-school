"""Routes exposed only by the isolated mobile development settings."""

from django.http import JsonResponse
from django.urls import path

from .urls import urlpatterns as application_urls


def local_health(request):
    return JsonResponse({'mode': 'mobile-local', 'database': 'sqlite-local'})


urlpatterns = [path('api/local/health/', local_health), *application_urls]
