import datetime
import json

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import StudentGroup, User
from lessons.models import Lesson, StudentRecurringSchedule, TeacherAvailability
from lessons.scheduling import create_group_schedule_and_lessons
from payments.models import StudentFinanceProfile


class StudentGroupUpdateTests(TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            email='group-update-teacher@test.com', password='123', role='teacher', name='Teacher',
        )
        self.students = [
            User.objects.create_user(
                email=f'group-update-{index}@test.com', password='123', role='student',
                name=f'Student {index}', level='A1/A2', planned_lessons_count=40,
            )
            for index in range(2)
        ]
        self.group = StudentGroup.objects.create(name='Shared group', teacher=self.teacher)
        self.group.students.add(*self.students)
        TeacherAvailability.objects.create(
            teacher=self.teacher, day_of_week=2,
            start_time=datetime.time(8), end_time=datetime.time(22),
        )
        self.entries = [{'day_of_week': 2, 'time': '19:30:00'}]
        self.lessons = create_group_schedule_and_lessons(
            self.group, self.students[0], teacher=self.teacher, schedule_entries=self.entries,
        )
        self.schedule = StudentRecurringSchedule.objects.get(group=self.group)
        self.client = APIClient()
        self.client.force_authenticate(self.teacher)

    def save_student(self, student, **changes):
        payload = {
            'name': student.name,
            'planned_lessons_count': '40',
            'completed_lessons_count': '0',
            'teacher_id': str(self.teacher.id),
            'schedules': json.dumps(self.entries),
            **changes,
        }
        return self.client.patch(f'/api/accounts/users/{student.id}/', payload, format='multipart')

    def lesson_snapshot(self):
        return list(Lesson.objects.filter(group=self.group).order_by('order').values_list('id', 'date', 'status'))

    def assert_no_individual_track(self):
        self.assertFalse(Lesson.objects.filter(student__in=self.students, is_template=False, is_extra=False).exists())

    def test_teacher_can_start_a_group_lesson_without_individual_sequence_parameters(self):
        lesson = self.lessons[0]
        response = self.client.patch(f'/api/lessons/{lesson.id}/start_lesson/', {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        lesson.refresh_from_db()
        self.assertEqual(lesson.status, 'in_progress')
        self.assertEqual(lesson.group, self.group)
        self.assertEqual(Lesson.objects.filter(group=self.group).count(), 40)
        self.assert_no_individual_track()

    def test_every_member_can_see_the_shared_schedule(self):
        for student in self.students:
            with self.subTest(student=student.email):
                response = self.client.get(f'/api/accounts/users/{student.id}/')
                self.assertEqual(response.status_code, 200)
                self.assertEqual(len(response.data['recurring_schedules']), 1)
                self.assertEqual(response.data['recurring_schedules'][0]['id'], str(self.schedule.id))
                self.assertEqual(response.data['recurring_schedules'][0]['group'], self.group.id)
                self.assertEqual(list(map(str, response.data['student_groups'])), [str(self.group.id)])

        self.client.force_authenticate(self.students[1])
        response = self.client.get('/api/student-schedules/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['results'][0]['id'], str(self.schedule.id))

    def test_saving_either_member_without_schedule_changes_preserves_the_shared_track(self):
        snapshot = self.lesson_snapshot()
        for student in self.students:
            with self.subTest(student=student.email):
                response = self.save_student(student, name='Updated profile')
                self.assertEqual(response.status_code, 200, response.data)
                student.refresh_from_db()
                self.assertEqual(student.name, 'Updated profile')
                self.assertEqual(self.lesson_snapshot(), snapshot)
                self.assert_no_individual_track()

    def test_finance_changes_are_individual_and_do_not_realign_the_group(self):
        snapshot = self.lesson_snapshot()
        response = self.save_student(self.students[1], monthly_fee='350.00', due_day='12')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(StudentFinanceProfile.objects.get(student=self.students[1]).monthly_fee, 350)
        self.assertFalse(StudentFinanceProfile.objects.filter(student=self.students[0]).exists())
        self.assertEqual(self.lesson_snapshot(), snapshot)
        self.assert_no_individual_track()

    def test_saving_effective_group_totals_does_not_change_progress_or_dates(self):
        self.students[1].planned_lessons_count = 0
        self.students[1].save(update_fields=['planned_lessons_count'])
        # A lesson can be completed outside the sequence order.
        completed = self.lessons[3]
        completed.status = 'completed'
        completed.save(update_fields=['status'])
        snapshot = self.lesson_snapshot()
        response = self.save_student(self.students[1], completed_lessons_count='1')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.lesson_snapshot(), snapshot)
        self.assert_no_individual_track()

    def test_schedule_change_does_not_apply_a_members_previous_progress_to_the_group(self):
        self.students[1].completed_lessons_count = 10
        self.students[1].save(update_fields=['completed_lessons_count'])
        response = self.save_student(
            self.students[1], completed_lessons_count='10',
            schedules=json.dumps([{'day_of_week': 2, 'time': '20:30:00'}]),
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(Lesson.objects.filter(group=self.group, status='completed').exists())
        self.assertEqual(Lesson.objects.filter(group=self.group).count(), 40)
        self.assert_no_individual_track()

    def test_either_member_can_change_the_shared_schedule(self):
        original_ids = {lesson.id for lesson in self.lessons}
        for student, time_value in zip(self.students, ['20:30:00', '18:30:00']):
            with self.subTest(student=student.email):
                response = self.save_student(
                    student, schedules=json.dumps([{'day_of_week': 2, 'time': time_value}]),
                )
                self.assertEqual(response.status_code, 200, response.data)
                schedule = StudentRecurringSchedule.objects.get(group=self.group)
                self.assertEqual(schedule.start_time, datetime.time.fromisoformat(time_value))
                lessons = Lesson.objects.filter(group=self.group)
                self.assertEqual(set(lessons.values_list('id', flat=True)), original_ids)
                for lesson in lessons:
                    self.assertEqual(timezone.localtime(lesson.date).time(), schedule.start_time)
                    self.assertEqual(timezone.localtime(lesson.date).weekday(), 2)
                self.assert_no_individual_track()

    def test_changed_counts_update_one_shared_track_for_all_members(self):
        response = self.save_student(self.students[1], planned_lessons_count='42', completed_lessons_count='1')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Lesson.objects.filter(group=self.group).count(), 42)
        self.assertEqual(Lesson.objects.filter(group=self.group, status='completed').count(), 1)
        for student in self.students:
            detail = self.client.get(f'/api/accounts/users/{student.id}/')
            self.assertEqual(detail.data['effective_planned_lessons_count'], 42)
            self.assertEqual(detail.data['effective_completed_lessons_count'], 1)
        self.assert_no_individual_track()

    def test_schedule_changes_preserve_completed_active_rescheduled_and_extra_lessons(self):
        completed, active, exception = self.lessons[:3]
        completed.status = 'completed'
        completed.date = timezone.now() - datetime.timedelta(days=7)
        completed.save()
        active.status = 'in_progress'
        active.save()
        exception.status = 'rescheduled'
        exception.original_date = exception.date
        exception.date += datetime.timedelta(days=1)
        exception.schedule_exception = True
        exception.save()
        extra = Lesson.objects.create(
            group=self.group, teacher=self.teacher, title='Extra', level='A1/A2',
            is_extra=True, status='scheduled', date=self.lessons[3].date + datetime.timedelta(hours=2),
        )
        snapshot = {lesson.id: (lesson.date, lesson.status) for lesson in [completed, active, exception, extra]}
        response = self.save_student(
            self.students[1], schedules=json.dumps([{'day_of_week': 2, 'time': '20:30:00'}]),
        )
        self.assertEqual(response.status_code, 200, response.data)
        for lesson_id, expected in snapshot.items():
            lesson = Lesson.objects.get(pk=lesson_id)
            self.assertEqual((lesson.date, lesson.status), expected)
        self.assert_no_individual_track()

    def test_conflicting_schedule_rolls_back_profile_finance_and_schedule(self):
        StudentRecurringSchedule.objects.create(
            teacher=self.teacher, student=User.objects.create_user(email='busy@test.com'),
            day_of_week=2, start_time=datetime.time(20, 30),
        )
        snapshot = self.lesson_snapshot()
        response = self.save_student(
            self.students[1], name='Must roll back', monthly_fee='350.00', due_day='12',
            schedules=json.dumps([{'day_of_week': 2, 'time': '20:30:00'}]),
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('se sobrepõe', str(response.data['schedule']))
        self.students[1].refresh_from_db()
        self.assertEqual(self.students[1].name, 'Student 1')
        self.assertFalse(StudentFinanceProfile.objects.filter(student=self.students[1]).exists())
        self.schedule.refresh_from_db()
        self.assertEqual(self.schedule.start_time, datetime.time(19, 30))
        self.assertEqual(self.lesson_snapshot(), snapshot)
        self.assert_no_individual_track()

    def test_failed_realignment_restores_the_original_shared_schedule_and_profile(self):
        first_date = timezone.localtime(self.lessons[0].date).replace(hour=20, minute=30)
        Lesson.objects.bulk_create([
            Lesson(
                teacher=self.teacher, title='Busy', level='A1/A2', status='scheduled',
                date=first_date + datetime.timedelta(weeks=index),
            )
            for index in range(60)
        ])
        snapshot = self.lesson_snapshot()
        response = self.save_student(
            self.students[0], name='Must roll back', monthly_fee='350.00',
            schedules=json.dumps([{'day_of_week': 2, 'time': '20:30:00'}]),
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('Não foi possível redistribuir', str(response.data['schedule']))
        self.students[0].refresh_from_db()
        self.assertEqual(self.students[0].name, 'Student 0')
        self.assertFalse(StudentFinanceProfile.objects.filter(student=self.students[0]).exists())
        self.schedule.refresh_from_db()
        self.assertEqual(self.schedule.start_time, datetime.time(19, 30))
        self.assertEqual(self.lesson_snapshot(), snapshot)
        self.assert_no_individual_track()

    def test_clearing_the_shared_schedule_does_not_create_an_individual_track(self):
        response = self.save_student(self.students[1], schedules='[]')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(StudentRecurringSchedule.objects.filter(group=self.group).exists())
        self.assertEqual(Lesson.objects.filter(group=self.group, status='pending', date=None).count(), 40)
        self.assert_no_individual_track()

    def test_changing_a_shared_schedule_through_change_slot_realigns_group_lessons(self):
        # Updated group schedules no longer need an individual student as their owner.
        self.schedule.student = None
        self.schedule.save(update_fields=['student'])
        response = self.client.patch(
            f'/api/student-schedules/{self.schedule.id}/change_slot/',
            {'day_of_week': 2, 'start_time': '20:30:00'}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['updated_lessons'], 40)
        for lesson in Lesson.objects.filter(group=self.group):
            self.assertEqual(timezone.localtime(lesson.date).time(), datetime.time(20, 30))
        self.assert_no_individual_track()

    def test_availability_excludes_only_group_lessons_that_will_move(self):
        active = self.lessons[0]
        active.status = 'in_progress'
        active.save(update_fields=['status'])
        exception = self.lessons[1]
        exception.schedule_exception = True
        exception.save(update_fields=['schedule_exception'])
        extra = Lesson.objects.create(
            group=self.group, teacher=self.teacher, title='Extra', level='A1/A2',
            is_extra=True, status='scheduled', date=self.lessons[2].date + datetime.timedelta(hours=1),
        )
        unrelated = Lesson.objects.create(
            teacher=self.teacher, title='Other lesson', level='A1/A2',
            status='scheduled', date=self.lessons[3].date + datetime.timedelta(hours=1),
        )
        response = self.client.get(
            f'/api/teacher-availability/{self.teacher.id}/', {'exclude_schedules': str(self.schedule.id)},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual({datetime.datetime.fromisoformat(value) for value in response.data['busy']}, {
            lesson.date for lesson in [active, exception, extra, unrelated]
        })

    def test_availability_rejects_invalid_excluded_schedule_ids(self):
        response = self.client.get(
            f'/api/teacher-availability/{self.teacher.id}/', {'exclude_schedules': 'invalid'},
        )
        self.assertEqual(response.status_code, 400)
