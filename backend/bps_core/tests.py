from django.conf import settings
from django.test import SimpleTestCase
from django.urls import resolve
from django.views.static import serve


class MediaUrlRoutingTests(SimpleTestCase):
    def test_media_files_route_to_static_serve_view(self):
        match = resolve('/media/ai_study/speaking_audio/example.webm')

        self.assertIs(match.func, serve)
        self.assertEqual(match.kwargs['document_root'], settings.MEDIA_ROOT)
