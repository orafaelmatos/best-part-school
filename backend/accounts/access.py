"""Server-side scopes shared by the web and mobile clients."""

from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import permissions


def is_admin(user):
    return bool(user.is_authenticated and (user.is_superuser or user.role == 'admin'))


def managed_students(user):
    students = get_user_model().objects.filter(role='student')
    if is_admin(user):
        return students
    if user.role == 'teacher':
        return students.filter(
            Q(lessons_attended__teacher=user)
            | Q(student_groups__teacher=user)
            | Q(student_groups__lessons__teacher=user)
            | Q(finance_profile__teacher=user)
        ).distinct()
    return students.none()


def visible_users(user):
    users = get_user_model().objects.all()
    if is_admin(user):
        return users
    return users.filter(Q(pk=user.pk) | Q(pk__in=managed_students(user))).distinct()


class IsSchoolManager(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and (is_admin(request.user) or request.user.role == 'teacher')


class SchoolManagerOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and (
            request.method in permissions.SAFE_METHODS
            or is_admin(request.user)
            or request.user.role == 'teacher'
        )
