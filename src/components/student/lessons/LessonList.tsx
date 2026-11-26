import { Check, ChevronDown, Clock3, FileText, Image as ImageIcon, Play, Video, X, type LucideIcon } from "lucide-react";

import RichTextContent from "@/components/RichTextContent";
import { Badge, IconTile, ListGroup, StudyBlock } from "@/components/student/ui";
import { iconStroke } from "@/design-system/tokens";
import {
  type LessonHistoryLesson,
  type LessonHistorySummary,
  getSummaryPreview,
  stripHtml,
} from "@/lib/studentLessonHistory";
import { cn } from "@/lib/utils";

import { formatLessonMeta, formatLessonTimeRange, getLessonStatusDisplay } from "./lessonDisplay";

/** One list for every segment: each lesson appears once, the whole row opens its notes. */
export function LessonList({ lessons, expandedId, nextLessonId, onToggleLesson, summaryByLesson }: {
  lessons: LessonHistoryLesson[];
  expandedId: string | null;
  nextLessonId?: string;
  onToggleLesson: (lessonId: string) => void;
  summaryByLesson: Map<string, LessonHistorySummary>;
}) {
  return (
    <ListGroup>
      {lessons.map((lesson) => (
        <LessonRow
          key={lesson.id}
          expanded={expandedId === lesson.id}
          isNext={lesson.id === nextLessonId}
          lesson={lesson}
          onToggle={() => onToggleLesson(lesson.id)}
          summary={summaryByLesson.get(lesson.id)}
        />
      ))}
    </ListGroup>
  );
}

function LessonRow({ expanded, isNext, lesson, onToggle, summary }: {
  expanded: boolean;
  isNext: boolean;
  lesson: LessonHistoryLesson;
  onToggle: () => void;
  summary?: LessonHistorySummary;
}) {
  const status = getLessonStatusDisplay(lesson, isNext);
  const preview = getSummaryPreview(summary) || stripHtml(lesson.notes);
  const details = [lesson.teacher_name ? `Professor ${lesson.teacher_name}` : "", lesson.level ? `Nível ${lesson.level}` : ""]
    .filter(Boolean)
    .join(" · ");
  const detailId = `lesson-details-${lesson.id}`;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={detailId}
        className="flex min-h-16 w-full items-start gap-3 px-4 py-4 text-left transition-colors duration-150 ease-standard hover:bg-surface-muted active:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <IconTile icon={status.icon} tone={status.tile} className="mt-0.5" />
        <span className="min-w-0 flex-1">
          <span className="block text-caption text-ink-muted">{formatLessonMeta(lesson)}</span>
          <span className="mt-0.5 block break-words text-body font-medium text-ink">{lesson.title}</span>
          <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge tone={status.badge}>{status.label}</Badge>
            {details ? <span className="text-caption text-ink-secondary">{details}</span> : null}
          </span>
          {preview && !expanded ? (
            <span className="mt-2 line-clamp-2 block text-caption text-ink-secondary">{preview}</span>
          ) : null}
        </span>
        <ChevronDown
          size={20}
          strokeWidth={iconStroke}
          aria-hidden="true"
          className={cn("mt-2.5 shrink-0 text-ink-muted transition-transform duration-200 ease-standard", expanded && "rotate-180")}
        />
      </button>
      {expanded ? (
        <div id={detailId} className="border-t border-line px-4 pb-6 pt-5 sm:px-5">
          <LessonDetails lesson={lesson} summary={summary} />
        </div>
      ) : null}
    </li>
  );
}

// RichTextContent is shared with staff pages: style its HTML from the wrapper only.
const richTextClasses = [
  "mt-3 max-w-prose text-body-lg leading-7",
  "[&_h1]:mt-6 [&_h1]:text-h4 [&_h2]:mt-6 [&_h2]:text-h4 [&_h3]:mt-5 [&_h3]:text-body-lg [&_h3]:font-semibold",
  "[&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1",
  "[&_blockquote]:my-4 [&_blockquote]:rounded-lg [&_blockquote]:bg-primary-subtle [&_blockquote]:px-4 [&_blockquote]:py-3",
  "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  "[&>*:first-child]:mt-0",
].join(" ");

function DetailHeading({ id, children }: { id: string; children: string }) {
  return <h3 id={id} className="text-h4 text-ink">{children}</h3>;
}

function LessonDetails({ lesson, summary }: { lesson: LessonHistoryLesson; summary?: LessonHistorySummary }) {
  const richDetail = summary?.summary || lesson.notes || "";
  const attachments = lesson.attachments || [];
  const hasLinks = Boolean(lesson.meeting_url || lesson.recording_url || attachments.length);
  const summaryWords = summary?.words || [];
  const words = summaryWords.length ? summaryWords : lesson.new_words || [];
  const mistakes = (summary?.mistakes || []).slice(0, 3);
  const prefix = `lesson-${lesson.id}`;

  return (
    <div className="space-y-6">
      {lesson.date ? (
        <p className="flex items-center gap-2 text-body text-ink-secondary">
          <Clock3 size={16} strokeWidth={iconStroke} aria-hidden="true" className="shrink-0" />
          {formatLessonTimeRange(lesson.date)}
        </p>
      ) : null}

      <section aria-labelledby={`${prefix}-summary`}>
        <DetailHeading id={`${prefix}-summary`}>Resumo da aula</DetailHeading>
        <RichTextContent
          value={richDetail}
          fallback="O professor ainda não adicionou resumo ou materiais para esta aula."
          className={`${richTextClasses} ${richDetail ? "text-ink" : "text-ink-secondary"}`}
        />
      </section>

      {words.length ? (
        <section aria-labelledby={`${prefix}-words`}>
          <DetailHeading id={`${prefix}-words`}>Palavras da aula</DetailHeading>
          <dl className="mt-2 divide-y divide-line">
            {words.map((word) => (
              <div key={word.id} className="py-3">
                <dt lang="en" className="break-words text-body-lg font-semibold text-ink">{word.word}</dt>
                {word.meaning ? <dd className="mt-0.5 break-words text-body text-ink-secondary">{word.meaning}</dd> : null}
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {mistakes.length ? (
        <section aria-labelledby={`${prefix}-review`}>
          <DetailHeading id={`${prefix}-review`}>Pontos para revisar</DetailHeading>
          <ul className="mt-3 space-y-3">
            {mistakes.map((mistake) => (
              <li key={mistake.id}>
                <StudyBlock kind="correction" title="Correção">
                  <p className="flex items-start gap-2">
                    <X size={20} strokeWidth={iconStroke} aria-hidden="true" className="mt-0.5 shrink-0 text-danger" />
                    <span className="min-w-0 break-words">
                      <span className="block text-caption text-ink">Em vez de</span>
                      <span lang="en">{mistake.mistake}</span>
                    </span>
                  </p>
                  {mistake.correction ? (
                    <p className="mt-3 flex items-start gap-2">
                      <Check size={20} strokeWidth={iconStroke} aria-hidden="true" className="mt-0.5 shrink-0 text-success" />
                      <span className="min-w-0 break-words">
                        <span className="block text-caption text-ink">Use</span>
                        <span lang="en">{mistake.correction}</span>
                      </span>
                    </p>
                  ) : null}
                </StudyBlock>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby={`${prefix}-materials`}>
        <DetailHeading id={`${prefix}-materials`}>Materiais</DetailHeading>
        {hasLinks ? (
          <ul className="mt-2 divide-y divide-line">
            {lesson.meeting_url ? <MaterialLink href={lesson.meeting_url} icon={Video} label="Link da aula" /> : null}
            {lesson.recording_url ? <MaterialLink href={lesson.recording_url} icon={Play} label="Gravação" /> : null}
            {attachments.map((attachment) =>
              attachment.is_image ? (
                <ImageMaterialLink key={attachment.id} href={attachment.file_url} label={attachment.file_name || "Imagem anexada"} />
              ) : (
                <MaterialLink key={attachment.id} href={attachment.file_url} icon={FileText} label={attachment.file_name || "Arquivo anexado"} />
              ),
            )}
          </ul>
        ) : (
          <p className="mt-2 text-body text-ink-secondary">Nenhum material anexado ainda.</p>
        )}
      </section>
    </div>
  );
}

const linkClasses =
  "rounded-md text-body font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

function MaterialLink({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <li>
      <a href={href} target="_blank" rel="noreferrer" className={`flex min-h-12 items-center gap-3 py-2 ${linkClasses}`}>
        <Icon size={20} strokeWidth={iconStroke} aria-hidden="true" className="shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
        <span className="sr-only"> (abre em nova aba)</span>
      </a>
    </li>
  );
}

function ImageMaterialLink({ href, label }: { href: string; label: string }) {
  return (
    <li className="py-3">
      <a href={href} target="_blank" rel="noreferrer" className={`block ${linkClasses}`}>
        <img src={href} alt={label} className="h-40 w-full rounded-lg border border-line bg-surface-muted object-cover" />
        <span className="mt-2 flex min-h-11 items-center gap-3">
          <ImageIcon size={20} strokeWidth={iconStroke} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 truncate">{label}</span>
          <span className="sr-only"> (abre em nova aba)</span>
        </span>
      </a>
    </li>
  );
}
