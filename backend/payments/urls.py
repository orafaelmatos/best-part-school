from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    PaymentViewSet,
    StudentFinanceProfileViewSet,
    FinancialSettingsAPIView,
    TeacherFinanceDashboardAPIView,
    StudentFinanceDetailAPIView,
    MyFinanceAPIView,
)


router = DefaultRouter()
router.register(r'payments', PaymentViewSet, basename='payment')
router.register(r'finance-profiles', StudentFinanceProfileViewSet, basename='finance-profile')


urlpatterns = [
    path('finance/settings/me/', FinancialSettingsAPIView.as_view(), name='finance-settings'),
    path('finance/dashboard/', TeacherFinanceDashboardAPIView.as_view(), name='finance-dashboard'),
    path('finance/student/<uuid:student_id>/', StudentFinanceDetailAPIView.as_view(), name='student-finance-detail'),
    path('finance/me/', MyFinanceAPIView.as_view(), name='my-finance'),
    path('', include(router.urls)),
]
