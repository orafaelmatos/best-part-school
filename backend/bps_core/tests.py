import tempfile
from pathlib import Path
from unittest.mock import patch

from django.core.files.storage import default_storage
from django.test import SimpleTestCase, override_settings
from .media import signed_media_url


class PrivateMediaTests(SimpleTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.override = override_settings(MEDIA_ROOT=self.directory.name, PRIVATE_MEDIA_URL_TTL=900)
        self.override.enable()
        self.addCleanup(self.override.disable)
        path = Path(self.directory.name) / 'private' / 'recording.mp3'
        path.parent.mkdir()
        path.write_bytes(b'0123456789')

    def test_raw_media_is_not_public(self):
        self.assertEqual(self.client.get('/media/private/recording.mp3').status_code, 404)

    def test_file_urls_are_signed_and_playable(self):
        url = default_storage.url('private/recording.mp3')
        self.assertIn('access=', url)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b''.join(response.streaming_content), b'0123456789')
        self.assertEqual(response['Cache-Control'], 'private, no-store')

    def test_signed_url_cannot_be_reused_for_another_path(self):
        url = default_storage.url('private/recording.mp3')
        self.assertEqual(self.client.get(url.replace('/recording.mp3', '/other.mp3')).status_code, 404)

    def test_expired_urls_are_rejected(self):
        with patch('django.core.signing.time.time', return_value=1000):
            url = default_storage.url('private/recording.mp3')
        with patch('django.core.signing.time.time', return_value=1901):
            self.assertEqual(self.client.get(url).status_code, 404)

    def test_ranges_support_native_audio_players(self):
        response = self.client.get(default_storage.url('private/recording.mp3'), HTTP_RANGE='bytes=2-5')
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response['Content-Range'], 'bytes 2-5/10')
        self.assertEqual(b''.join(response.streaming_content), b'2345')

    def test_external_urls_and_traversal_are_never_signed(self):
        for url in ['https://untrusted.test/media/private/file', '/media/../settings.py']:
            self.assertEqual(signed_media_url(url), url)

    def test_invalid_ranges_do_not_leak_contents(self):
        response = self.client.get(default_storage.url('private/recording.mp3'), HTTP_RANGE='bytes=100-200')
        self.assertEqual(response.status_code, 416)
