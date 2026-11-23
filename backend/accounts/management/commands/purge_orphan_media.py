from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from accounts.file_cleanup import is_still_referenced


class Command(BaseCommand):
    help = 'Inspeciona arquivos sem referência; só apaga quando --delete é informado.'

    def add_arguments(self, parser):
        parser.add_argument('--delete', action='store_true')
        parser.add_argument('--older-than-days', type=int, default=7)

    def handle(self, *args, **options):
        days = options['older_than_days']
        if days < 1:
            raise CommandError('Use pelo menos 1 dia para preservar uploads em andamento.')
        root = Path(settings.MEDIA_ROOT).resolve()
        cutoff = (timezone.now() - timedelta(days=days)).timestamp()
        count = 0
        if root.exists():
            for path in root.rglob('*'):
                if path.is_symlink() or not path.is_file() or path.stat().st_mtime >= cutoff:
                    continue
                name = path.relative_to(root).as_posix()
                if not is_still_referenced(name):
                    count += 1
                    if options['delete']:
                        path.unlink(missing_ok=True)
        label = 'removidos' if options['delete'] else 'encontrados (simulação; nenhum arquivo removido)'
        self.stdout.write(f'{count} arquivo(s) órfão(s) {label}.')
