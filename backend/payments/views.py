from rest_framework import viewsets, permissions
from .models import Payment
from .serializers import PaymentSerializer

class PaymentViewSet(viewsets.ModelViewSet):
    serializer_class = PaymentSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        user = self.request.user
        if getattr(user, 'is_authenticated', False) and user.role != 'admin':
            return Payment.objects.filter(student=user)
        return Payment.objects.all()

    def perform_create(self, serializer):
        from django.contrib.auth import get_user_model
        user = self.request.user
        if getattr(user, 'is_authenticated', False):
            serializer.save(student=user)
        else:
            serializer.save(student=get_user_model().objects.last())
