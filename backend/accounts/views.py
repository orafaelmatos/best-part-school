from rest_framework import generics, permissions
from .models import StudentGroup
from .serializers import RegisterSerializer, UserSerializer, CustomTokenObtainPairSerializer, StudentGroupSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from django.contrib.auth import get_user_model
from rest_framework.exceptions import PermissionDenied
from .access import IsSchoolManager, SchoolManagerOrReadOnly, is_admin, visible_users

User = get_user_model()

class UserListView(generics.ListAPIView):
    serializer_class = UserSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        return visible_users(self.request.user).order_by('name', 'email')

class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = UserSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        return visible_users(self.request.user)

    def perform_destroy(self, instance):
        if not is_admin(self.request.user):
            from lessons.models import Lesson
            from payments.models import Payment
            from django.db.models import Q
            actor = self.request.user
            shared = (
                Lesson.objects.filter(Q(student=instance) | Q(group__students=instance)).exclude(teacher__in=[actor]).exclude(teacher=None).exists()
                or StudentGroup.objects.filter(students=instance).exclude(teacher=actor).exists()
                or Payment.objects.filter(student=instance).exclude(teacher=actor).exists()
                or (getattr(instance, 'finance_profile', None) and instance.finance_profile.teacher_id != actor.pk)
            )
            if actor.role != 'teacher' or instance.role != 'student' or shared:
                raise PermissionDenied('Contas compartilhadas com outros professores precisam ser excluídas pela administração ou pelo próprio aluno.')
        if instance.pk == self.request.user.pk:
            raise PermissionDenied('Use o fluxo de exclusão da própria conta.')
        instance.delete()

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (IsSchoolManager,)
    serializer_class = RegisterSerializer

class StudentGroupListCreateView(generics.ListCreateAPIView):
    serializer_class = StudentGroupSerializer
    permission_classes = (SchoolManagerOrReadOnly,)

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
