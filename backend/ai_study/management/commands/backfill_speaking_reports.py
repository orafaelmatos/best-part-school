"""Recover only saved pedagogy from earlier phases; never call an AI provider."""
import uuid
from django.core.management.base import BaseCommand
from django.db import transaction
from ai_study.models import AIStudySession
from ai_study.models import SpeakingSessionReport
from ai_study.services import AIStudyWorkflowService


class Command(BaseCommand):
    help = 'Cria relatórios para estados de Speaking anteriores à Fase 5, sem reavaliar respostas.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        recovered, skipped = 0, 0
        sessions = AIStudySession.objects.filter(mode='speaking').order_by('pk').values_list('pk', flat=True)
        for pk in sessions.iterator():
            try:
                with transaction.atomic():
                    session = AIStudySession.objects.select_for_update().get(pk=pk)
                    state = session.guided_state
                    engine = state.get('speaking')
                    if not engine:
                        continue
                    engine.setdefault('run_id', str(uuid.uuid5(uuid.NAMESPACE_URL, f'speaking-session:{pk}')))
                    if session.speaking_reports.filter(run_id=engine['run_id']).exists():
                        continue
                    status = 'completed' if session.status == 'completed' else (
                        'paused' if state.get('stage') == 'summary' else
                        'situation_completed' if engine.get('objective_completed') else 'active')
                    item = AIStudyWorkflowService._save_speaking_report(session, state, status)
                    # Keep history ordered by observed activity; the exact old closure time is unknown.
                    SpeakingSessionReport.objects.filter(pk=item.pk).update(
                        created_at=session.created_at, updated_at=session.last_interaction_at, completed_at=None,
                    )
                    AIStudyWorkflowService.persist_guided_state(session, state)
                    recovered += 1
                    if options['dry_run']:
                        transaction.set_rollback(True)
            except (KeyError, ValueError, TypeError):
                skipped += 1
                self.stderr.write(f'Sessão {pk}: estado incompleto; preservado sem gerar avaliação.')
        self.stdout.write(f'{recovered} relatórios {"previstos" if options["dry_run"] else "recuperados"}; {skipped} estados incompletos.')
