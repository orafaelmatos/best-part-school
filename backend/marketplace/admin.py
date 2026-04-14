from django.contrib import admin
from .models import Course

@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ('title', 'price', 'is_free', 'is_discounted', 'created_by', 'created_at')
    list_filter = ('is_free', 'is_discounted', 'created_by')
    search_fields = ('title', 'description')
