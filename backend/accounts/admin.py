from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, StudentGroup

@admin.register(User)
class CustomUserAdmin(UserAdmin):
    ordering = ('email',)
    list_display = ('email', 'name', 'role', 'level', 'is_staff', 'is_active')
    list_filter = ('role', 'level', 'is_staff', 'is_superuser', 'is_active')
    search_fields = ('email', 'name')
    # Customizing fieldsets because we removed 'username' field
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal Info', {'fields': ('name', 'role', 'level')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )


@admin.register(StudentGroup)
class StudentGroupAdmin(admin.ModelAdmin):
    list_display = ('name', 'teacher', 'created_at')
    list_filter = ('teacher',)
    search_fields = ('name', 'teacher__email', 'students__email', 'students__name')
    filter_horizontal = ('students',)
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'name', 'password', 'role', 'level'),
        }),
    )
