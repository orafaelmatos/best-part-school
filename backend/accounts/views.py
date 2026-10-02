from rest_framework import generics, permissions
from .models import StudentGroup
from .serializers import RegisterSerializer, UserSerializer, CustomTokenObtainPairSerializer, StudentGroupSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from django.contrib.auth import get_user_model

User = get_user_model()

class UserListView(generics.ListAPIView):
    queryset = User.objects.all().order_by('name', 'email')
    serializer_class = UserSerializer
    permission_classes = (permissions.IsAuthenticated,)

class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = (permissions.IsAuthenticated,)

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (permissions.AllowAny,)
    serializer_class = RegisterSerializer

class StudentGroupListCreateView(generics.ListCreateAPIView):
    serializer_class = StudentGroupSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        user = self.request.user
        qs = StudentGroup.objects.prefetch_related('students').select_related('teacher')
        if user.role == 'admin':
            return qs
        if user.role == 'teacher':
            return qs.filter(teacher=user)
        return qs.filter(students=user)

    def perform_create(self, serializer):
        teacher = serializer.validated_data.get('teacher')
        if self.request.user.role == 'teacher':
            teacher = self.request.user
        serializer.save(teacher=teacher)

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
