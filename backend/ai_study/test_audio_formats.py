from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase

from .serializers import SpeakingAudioUploadSerializer


class SpeakingAudioFormatTests(SimpleTestCase):
    def test_ios_mp4_and_webm_with_codec_parameters_are_accepted(self):
        for content_type, filename in [
            ('audio/mp4', 'speech.mp4'),
            ('audio/mp4;codecs=mp4a.40.2', 'speech.mp4'),
            ('audio/webm;codecs=opus', 'speech.webm'),
            ('audio/wav', 'speech.wav'),
        ]:
            with self.subTest(content_type=content_type):
                audio = SimpleUploadedFile(filename, b'audio bytes', content_type=content_type)
                serializer = SpeakingAudioUploadSerializer(data={'audio': audio})
                self.assertTrue(serializer.is_valid(), serializer.errors)
                self.assertEqual(serializer.validated_data['audio'].name, filename)

    def test_unrelated_mime_types_are_rejected(self):
        audio = SimpleUploadedFile('speech.mp4', b'not audio', content_type='application/octet-stream')
        serializer = SpeakingAudioUploadSerializer(data={'audio': audio})
        self.assertFalse(serializer.is_valid())
        self.assertIn('audio', serializer.errors)

    def test_mp4_upload_size_limit_is_preserved(self):
        audio = SimpleUploadedFile('speech.mp4', b'audio', content_type='audio/mp4')
        audio.size = 25 * 1024 * 1024 + 1
        serializer = SpeakingAudioUploadSerializer(data={'audio': audio})
        self.assertFalse(serializer.is_valid())
        self.assertIn('25 MB', str(serializer.errors['audio']))
