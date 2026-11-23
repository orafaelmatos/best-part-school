"""Expiring file capabilities; JWTs and account passwords never appear in URLs."""

import mimetypes
import re
from html import escape, unescape
from pathlib import PurePosixPath
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit

from django.conf import settings
from django.core import signing
from django.core.files.storage import FileSystemStorage
from django.http import FileResponse, Http404, HttpResponse, StreamingHttpResponse
from django.utils.deconstruct import deconstructible
from django.utils.http import content_disposition_header
from django.views.decorators.http import require_safe

SALT = 'bps.private-media.v1'


def signed_media_url(url):
    if not url:
        return url
    parsed = urlsplit(str(url))
    base = urlsplit(settings.MEDIA_URL)
    prefix = base.path.rstrip('/') + '/'
    # Generated media URLs are local. Never sign an arbitrary external URL.
    if parsed.netloc or not parsed.path.startswith(prefix):
        return url
    from urllib.parse import unquote
    name = unquote(parsed.path[len(prefix):])
    if not name or '..' in PurePosixPath(name).parts or name.startswith('/') or '\\' in name:
        return url
    token = signing.dumps({'path': name}, salt=SALT, compress=True)
    query = [(key, value) for key, value in parse_qsl(parsed.query) if key != 'access']
    query.append(('access', token))
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), ''))


def signed_generated_media(value):
    """Only use for server-generated, read-only audio metadata, never user text."""
    if isinstance(value, dict):
        return {
            key: signed_media_url(item) if key.endswith('audio_url') and isinstance(item, str)
            else signed_generated_media(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [signed_generated_media(item) for item in value]
    return value


def refresh_embedded_images(value, files, request=None):
    """Refresh lesson HTML using only files belonging to that authorized lesson."""
    from django.core.files.storage import default_storage
    from urllib.parse import unquote
    allowed = {file.name for file in files if file and file.name}
    if not value or not allowed:
        return value
    prefix = settings.MEDIA_URL.rstrip('/') + '/'

    def replace(match):
        try:
            parsed = urlsplit(unescape(match.group(3)))
        except ValueError:
            return match.group(0)
        if not parsed.path.startswith(prefix):
            return match.group(0)
        name = unquote(parsed.path[len(prefix):])
        if name not in allowed:
            return match.group(0)
        url = default_storage.url(name)
        if request:
            url = request.build_absolute_uri(url)
        return f'{match.group(1)}{match.group(2)}{escape(url, quote=True)}{match.group(2)}'

    return re.sub(r'''(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']*)\2''', replace, value, flags=re.IGNORECASE)


@deconstructible
class PrivateMediaStorage(FileSystemStorage):
    def url(self, name):
        # Sign before DRF optionally expands this relative URL to an absolute URL.
        return signed_media_url(f"{settings.MEDIA_URL.rstrip('/')}/{quote(name)}")


@require_safe
def private_media(request, path):
    try:
        payload = signing.loads(request.GET.get('access', ''), salt=SALT,
                                max_age=settings.PRIVATE_MEDIA_URL_TTL)
        if payload != {'path': path} or '..' in PurePosixPath(path).parts or '\\' in path:
            raise signing.BadSignature()
        storage = FileSystemStorage()
        stream = storage.open(path, 'rb')
        size = storage.size(path)
    except (signing.BadSignature, ValueError, OSError):
        raise Http404('Arquivo não disponível.')

    mime = mimetypes.guess_type(path)[0] or 'application/octet-stream'
    safe_inline = mime.startswith(('audio/', 'video/')) or mime in {
        'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'text/plain',
    }
    byte_range = request.headers.get('Range')
    if byte_range:
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', byte_range)
        try:
            if not match or not any(match.groups()):
                raise ValueError()
            first, last = match.groups()
            start = int(first) if first else max(0, size - int(last))
            end = min(int(last), size - 1) if first and last else size - 1
            if start < 0 or start > end or start >= size:
                raise ValueError()
        except ValueError:
            stream.close()
            response = HttpResponse(status=416)
            response['Content-Range'] = f'bytes */{size}'
            return response

        def chunks():
            try:
                stream.seek(start)
                remaining = end - start + 1
                while remaining:
                    data = stream.read(min(64 * 1024, remaining))
                    if not data:
                        break
                    remaining -= len(data)
                    yield data
            finally:
                stream.close()

        response = StreamingHttpResponse(chunks(), status=206, content_type=mime)
        response['Content-Range'] = f'bytes {start}-{end}/{size}'
        response['Content-Length'] = end - start + 1
    else:
        response = FileResponse(stream, as_attachment=not safe_inline,
                                filename=PurePosixPath(path).name, content_type=mime)
    response['Accept-Ranges'] = 'bytes'
    response['Content-Disposition'] = content_disposition_header(not safe_inline, PurePosixPath(path).name)
    response['Cache-Control'] = 'private, no-store'
    response['X-Content-Type-Options'] = 'nosniff'
    response['Referrer-Policy'] = 'no-referrer'
    response['Content-Security-Policy'] = "default-src 'none'; sandbox"
    return response
