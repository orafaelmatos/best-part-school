from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    code = getattr(exc, 'get_codes', lambda: None)()
    if response is not None and code in ('ai_consent_required', 'student_ai_consent_required'):
        response.data['code'] = code
    return response
