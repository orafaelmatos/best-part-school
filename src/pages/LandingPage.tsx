import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Laptop,
  Menu,
  Sparkles,
  Star,
  Target,
  UserCheck,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  fetchCourses,
  formatCurrency,
  getDisplayPrice,
  getOriginalPrice,
  isPaidCourse,
} from "@/lib/courses";
import { PUBLIC_PATHS } from "@/lib/routes";
import { cn } from "@/lib/utils";

const logoSrc = "/img/bps-logo.png";
const platformVideoSrc = "/video/Bps video landing page.mp4";
const teacherPhotoSrc = "/img/professor-best-part-school.jpeg";
const testimonialVideoOneSrc = "/video/depoimento-aluno-1.mp4";
const testimonialVideoTwoSrc = "/video/depoimento-aluno-2.mp4";
const contactUrl =
  "https://l.instagram.com/?u=https%3A%2F%2Fbeacons.ai%2Fbestpartschool%3Futm_source%3Dig%26utm_medium%3Dsocial%26utm_content%3Dlink_in_bio%26fbclid%3DPAcGRvZgJleHRuA2FlbQIxMQBzcnRjBmFwcF9pZA85MzY2MTk3NDMzOTI0NTkAAaevGUapV9pyqoZtLJ8WWmFsmwDwSeiykOwc6uKBkVSN4Kib28m0k0KpHa4Jkg_aem_GuctcshDaNHqTDEMJK9eqw&e=AUCrlQaTfjSTki8HjM_ZiCHRVhxmqvnNDjMTYba0EZ5C3QZOlzdDEhBcUY-VuyzVbeGH_rKiWMk5m_fm-Gl8mNcw28R23dt6xBf6-Q6atqqY4VNmA_IcLdrK0XXu60heZ0KghLQ";

type PublicPageKey = "home" | "courses" | "methodology" | "testimonials" | "teacher" | "contact";

const navItems: Array<{ label: string; to: string; page: PublicPageKey }> = [
  { label: "Início", to: PUBLIC_PATHS.home, page: "home" },
  { label: "Cursos", to: PUBLIC_PATHS.courses, page: "courses" },
  { label: "Metodologia", to: PUBLIC_PATHS.methodology, page: "methodology" },
  { label: "Depoimentos", to: PUBLIC_PATHS.testimonials, page: "testimonials" },
  { label: "Professor", to: PUBLIC_PATHS.teacher, page: "teacher" },
  { label: "Contato", to: PUBLIC_PATHS.contact, page: "contact" },
];

const pageMeta: Record<PublicPageKey, { title: string; description: string }> = {
  home: {
    title: "Best Part School | Inglês personalizado e inteligente",
    description:
      "Conheça a Best Part School, escola de inglês com aulas personalizadas, revisões inteligentes e acompanhamento individual.",
  },
  courses: {
    title: "Cursos | Best Part School",
    description: "Veja os cursos pagos disponíveis no marketplace da Best Part School.",
  },
  methodology: {
    title: "Metodologia | Best Part School",
    description: "Entenda como a metodologia da Best Part School combina aula, prática, revisão e evolução.",
  },
  testimonials: {
    title: "Depoimentos | Best Part School",
    description: "Assista depoimentos reais de alunos da Best Part School.",
  },
  teacher: {
    title: "Professor | Best Part School",
    description: "Conheça Gabriel Gaeski, professor e fundador da Best Part School.",
  },
  contact: {
    title: "Contato | Best Part School",
    description: "Entre em contato com a Best Part School ou acesse a área do aluno.",
  },
};

const stats = [
  { value: "+500", label: "aulas realizadas" },
  { value: "+100", label: "alunos acompanhados" },
  { value: "95%", label: "satisfação" },
  { value: "1:1", label: "metodologia personalizada" },
];

const differentiators = [
  {
    icon: Target,
    title: "Plano sob medida",
    text: "Cada aluno segue uma trilha ajustada ao objetivo, nível atual e rotina real de estudos.",
  },
  {
    icon: UserCheck,
    title: "Acompanhamento individual",
    text: "Evolução monitorada de perto, com feedback objetivo e próximos passos claros a cada aula.",
  },
];

const methodology = [
  {
    step: "01",
    title: "Aprenda",
    text: "Conteúdo claro, exemplos reais e explicações adaptadas ao seu nível.",
  },
  {
    step: "02",
    title: "Pratique",
    text: "Atividades personalizadas para transformar conhecimento em uso ativo.",
  },
  {
    step: "03",
    title: "Revise",
    text: "Flashcards e revisões inteligentes reforçam o que precisa ficar na memória.",
  },
  {
    step: "04",
    title: "Evolua",
    text: "Acompanhamento de progresso orienta as próximas aulas e consolida resultados.",
  },
];

const platformItems = [
  { icon: BarChart3, title: "Progresso", text: "Acompanhe evolução, histórico e pontos de melhoria." },
  { icon: Zap, title: "Flashcards", text: "Revise palavras e estruturas no momento certo." },
  { icon: BookOpen, title: "Resumos", text: "Materiais organizados para estudar depois da aula." },
  { icon: Check, title: "Tarefas", text: "Atividades direcionadas para manter constância." },
  { icon: Laptop, title: "Organização", text: "Tudo centralizado para deixar o estudo mais simples." },
  { icon: Clock3, title: "Histórico", text: "Veja aulas, palavras aprendidas e tarefas anteriores." },
];

const testimonialVideos = [
  {
    title: "Depoimento em vídeo",
    subtitle: "Aluno falando sobre a experiência com as aulas",
    src: testimonialVideoOneSrc,
  },
  {
    title: "Mais um relato real",
    subtitle: "Percepção de quem viveu a metodologia na prática",
    src: testimonialVideoTwoSrc,
  },
];

const faqs = [
  {
    question: "Como funcionam as aulas?",
    answer:
      "As aulas são planejadas de acordo com seu nível, objetivo e rotina. Você aprende, pratica, recebe feedback e revisa com apoio da plataforma.",
  },
  {
    question: "As aulas são online?",
    answer:
      "Sim. O formato online permite flexibilidade, materiais digitais e acompanhamento centralizado para evoluir com mais organização.",
  },
  {
    question: "Recebo materiais?",
    answer:
      "Sim. Os alunos recebem resumos, tarefas, flashcards e orientações de estudo para continuar praticando entre as aulas.",
  },
  {
    question: "Existe acompanhamento?",
    answer:
      "Sim. O progresso é acompanhado continuamente para ajustar conteúdos, revisar dificuldades e manter um plano de evolução claro.",
  },
  {
    question: "Como funciona pagamento?",
    answer:
      "Os detalhes de planos, frequência e pagamento são combinados no atendimento, conforme o formato de aula escolhido.",
  },
];

const setMetaTag = (name: string, content: string) => {
  let tag = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);

  if (!tag) {
    tag = document.createElement("meta");
    tag.name = name;
    document.head.appendChild(tag);
  }

  tag.content = content;
};

const getCurrentPage = (pathname: string): PublicPageKey => {
  return navItems.find((item) => item.to === pathname)?.page || "home";
};

const Reveal = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`landing-reveal ${className}`}>{children}</div>
);

const SectionHeader = ({
  eyebrow,
  title,
  description,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  description: string;
  align?: "center" | "left";
}) => (
  <div className={`max-w-3xl ${align === "center" ? "mx-auto text-center" : ""}`}>
    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500">{eyebrow}</p>
    <h2 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl lg:text-5xl">
      {title}
    </h2>
    <p className="mt-5 text-base leading-8 text-neutral-600 sm:text-lg">{description}</p>
  </div>
);

const PageHero = ({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) => (
  <section className="bg-neutral-950 px-4 pb-16 pt-32 text-white sm:px-6 lg:px-8 lg:pb-20 lg:pt-36">
    <Reveal>
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-400">{eyebrow}</p>
        <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
          {title}
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-neutral-300">{description}</p>
      </div>
    </Reveal>
  </section>
);

const SiteHeader = ({
  currentPage,
  isMenuOpen,
  setIsMenuOpen,
  closeMenu,
}: {
  currentPage: PublicPageKey;
  isMenuOpen: boolean;
  setIsMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  closeMenu: () => void;
}) => (
  <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#080808] text-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
    <nav className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
      <Link to={PUBLIC_PATHS.home} className="flex items-center gap-3" aria-label="Best Part School">
        <img
          src={logoSrc}
          alt="Best Part School"
          className="h-11 w-11 rounded bg-white object-contain p-1"
          width="44"
          height="44"
        />
        <div className="leading-tight">
          <span className="block text-sm font-semibold tracking-[0.18em]">BPS</span>
          <span className="block text-xs uppercase tracking-[0.24em] text-neutral-400">Best Part School</span>
        </div>
      </Link>

      <div className="hidden flex-1 items-center justify-center lg:flex">
        <div className="flex items-center gap-6">
          {navItems.map((item) => {
            const active = currentPage === item.page;

            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "relative inline-flex h-11 items-center px-1 text-sm font-semibold outline-none transition focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 after:absolute after:bottom-1 after:left-0 after:h-[2px] after:w-full after:origin-center after:scale-x-0 after:rounded-full after:bg-white after:transition-transform",
                  active
                    ? "text-white after:scale-x-100"
                    : "text-neutral-300 hover:text-white hover:after:scale-x-100",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="hidden items-center gap-3 lg:flex">
        <Button asChild className="h-11 rounded-full bg-white px-5 text-neutral-950 hover:bg-neutral-200">
          <Link to="/login">
            Área do Aluno
            <ArrowRight />
          </Link>
        </Button>
      </div>

      <button
        type="button"
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-white transition hover:bg-white/10 lg:hidden"
        onClick={() => setIsMenuOpen((current) => !current)}
        aria-label={isMenuOpen ? "Fechar menu" : "Abrir menu"}
      >
        {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
    </nav>

    {isMenuOpen && (
      <div className="border-t border-white/10 bg-[#080808] px-4 pb-5 pt-3 lg:hidden">
        <div className="mx-auto max-w-7xl">
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">
            Páginas do site
          </p>
          <div className="grid grid-cols-2 gap-2">
            {navItems.map((item) => {
              const active = currentPage === item.page;

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={closeMenu}
                  className={cn(
                    "rounded-xl border-b px-3 py-3 text-sm font-semibold outline-none transition focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
                    active
                      ? "border-white text-white"
                      : "border-white/10 text-neutral-300 hover:border-white/35 hover:text-white",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <Button asChild className="mt-3 h-11 w-full rounded-full bg-white text-neutral-950 hover:bg-neutral-200">
            <Link to="/login" onClick={closeMenu}>
              Área do Aluno
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    )}
  </header>
);

const HomePage = () => (
  <>
    <section className="relative overflow-hidden bg-neutral-950 px-4 pb-20 pt-32 text-white sm:px-6 lg:px-8 lg:pb-28 lg:pt-40">
      <div className="absolute inset-0 opacity-40">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
        <div className="absolute left-[-8%] top-24 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute right-[-4%] top-10 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="absolute left-1/2 top-20 h-[520px] w-[520px] -translate-x-1/2 rounded-full border border-white/10" />
        <div className="absolute left-1/2 top-36 h-[360px] w-[360px] -translate-x-1/2 rounded-full border border-white/10" />
      </div>

      <div className="relative mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-16">
        <Reveal>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium uppercase tracking-[0.22em] text-neutral-300 shadow-[0_10px_30px_rgba(15,23,42,0.25)]">
            <Sparkles size={14} />
            Inglês premium e personalizado
          </div>
          <h1 className="mt-8 max-w-4xl text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
            Best Part School
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-neutral-300 sm:text-xl">
            Aulas personalizadas, metodologia prática, acompanhamento individual e uma área do aluno pensada para manter clareza, constância e revisão inteligente.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 rounded-full bg-white px-7 text-neutral-950 hover:bg-neutral-200">
              <Link to={PUBLIC_PATHS.contact}>
                Começar agora
                <ArrowRight />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 rounded-full border-white/20 bg-transparent px-7 text-white hover:bg-white hover:text-neutral-950"
            >
              <Link to={PUBLIC_PATHS.courses}>Conhecer cursos</Link>
            </Button>
          </div>

          <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-2">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)] backdrop-blur"
              >
                <p className="text-2xl font-semibold tracking-tight text-white">{stat.value}</p>
                <p className="mt-1 text-sm text-neutral-300">{stat.label}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal className="lg:justify-self-end">
          <div className="relative mx-auto w-full max-w-3xl">
            <div className="absolute inset-x-8 top-8 h-40 rounded-full bg-cyan-300/20 blur-3xl" />
            <div className="absolute -right-6 bottom-10 h-36 w-36 rounded-full bg-emerald-300/20 blur-3xl" />

            <div className="relative rounded-[2rem] border border-white/12 bg-white/[0.06] p-3 shadow-[0_32px_120px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-4">
              <div className="rounded-[1.6rem] border border-white/10 bg-neutral-950/80 p-3 shadow-2xl sm:p-4">
                <div className="mb-4 flex items-center justify-between gap-3 rounded-[1.2rem] border border-white/10 bg-white/5 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    </div>
                    <p className="text-sm font-medium text-white">Área do aluno Best Part School</p>
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-[1.4rem] border border-white/10 bg-black">
                  <video
                    className="aspect-[16/10] w-full origin-center scale-[1.14] object-cover sm:scale-[1.18]"
                    src={platformVideoSrc}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                  >
                    Seu navegador não suporta vídeo em HTML5.
                  </video>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>

    <section className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <Reveal>
          <SectionHeader
            eyebrow="Navegação"
            title="Agora o site funciona por páginas"
            description="Use as abas no topo para abrir cada assunto separadamente. Cada página mostra apenas o conteúdo daquela área."
          />
        </Reveal>

        <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {navItems.filter((item) => item.page !== "home").map((item) => (
            <Reveal key={item.to}>
              <Link
                to={item.to}
                className="group flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-neutral-950 hover:shadow-xl"
              >
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Página</span>
                <span className="mt-4 text-xl font-semibold tracking-tight text-neutral-950">{item.label}</span>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-neutral-950">
                  Abrir
                  <ChevronRight size={16} className="transition group-hover:translate-x-1" />
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>

    <section className="bg-neutral-50 px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <Reveal>
          <SectionHeader
            eyebrow="Sobre a escola"
            title="Uma escola criada para transformar estudo em evolução consistente"
            description="A Best Part School combina ensino humano, estrutura clara e tecnologia para que cada aluno avance com confiança, sem perder tempo com conteúdos genéricos."
          />
        </Reveal>

        <div className="mt-14 grid gap-4 md:grid-cols-2">
          {differentiators.map((item) => (
            <Reveal key={item.title}>
              <div className="h-full rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-neutral-950 hover:shadow-xl">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-950 text-white">
                  <item.icon size={22} />
                </div>
                <h3 className="mt-6 text-xl font-semibold tracking-tight">{item.title}</h3>
                <p className="mt-3 leading-7 text-neutral-600">{item.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  </>
);

const CoursesPage = ({
  paidCourses,
  isLoadingCourses,
}: {
  paidCourses: Awaited<ReturnType<typeof fetchCourses>>;
  isLoadingCourses: boolean;
}) => (
  <>
    <PageHero
      eyebrow="Cursos"
      title="Cursos pagos do marketplace"
      description="Escolha um curso disponível para compra. Os cursos gratuitos ficam reservados para alunos dentro da plataforma."
    />

    <section className="bg-neutral-50 px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        {isLoadingCourses ? (
          <p className="text-center text-neutral-600">Carregando cursos...</p>
        ) : paidCourses.length === 0 ? (
          <p className="text-center text-neutral-600">Nenhum curso pago disponível no momento.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {paidCourses.map((course) => {
              const originalPrice = getOriginalPrice(course);

              return (
                <Reveal key={course.id}>
                  <article className="group flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-neutral-950 hover:shadow-xl">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100 text-neutral-950 transition group-hover:bg-neutral-950 group-hover:text-white">
                        <BookOpen size={22} />
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold tracking-tight text-neutral-950">
                          {formatCurrency(getDisplayPrice(course))}
                        </p>
                        {originalPrice !== null && (
                          <p className="text-xs text-neutral-500 line-through">{formatCurrency(originalPrice)}</p>
                        )}
                      </div>
                    </div>
                    <h3 className="mt-6 text-xl font-semibold tracking-tight">{course.title}</h3>
                    <p className="mt-3 flex-1 leading-7 text-neutral-600">{course.description}</p>
                    <div className="mt-5 flex items-center gap-2 text-sm text-neutral-700">
                      <Check size={16} />
                      Disponível para compra
                    </div>
                    <Link
                      to={PUBLIC_PATHS.contact}
                      className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-neutral-950"
                    >
                      Saiba mais
                      <ChevronRight size={16} className="transition group-hover:translate-x-1" />
                    </Link>
                  </article>
                </Reveal>
              );
            })}
          </div>
        )}
      </div>
    </section>
  </>
);

const MethodologyPage = () => (
  <>
    <PageHero
      eyebrow="Metodologia"
      title="Aprenda, pratique, revise e evolua com clareza"
      description="O ensino é progressivo, com aulas acompanhadas, flashcards, revisões inteligentes, atividades personalizadas e foco em retenção real."
    />

    <section className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {methodology.map((item) => (
            <Reveal key={item.step}>
              <div className="relative h-full rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm">
                <span className="text-sm font-semibold text-neutral-400">{item.step}</span>
                <h3 className="mt-8 text-2xl font-semibold tracking-tight">{item.title}</h3>
                <p className="mt-3 leading-7 text-neutral-600">{item.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>

    <section className="bg-neutral-950 px-4 py-20 text-white sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <Reveal>
          <SectionHeader
            eyebrow="Plataforma e tecnologia"
            title="Uma área do aluno para organizar sua evolução"
            description="Os alunos acessam um ambiente com progresso, flashcards, resumos, tarefas, palavras aprendidas, histórico e organização de estudos."
          />
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {platformItems.map((item) => (
            <Reveal key={item.title}>
              <div className="h-full rounded-2xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur transition duration-300 hover:-translate-y-1 hover:bg-white/[0.1]">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-neutral-950">
                  <item.icon size={20} />
                </div>
                <h3 className="mt-5 text-lg font-semibold">{item.title}</h3>
                <p className="mt-3 leading-7 text-neutral-300">{item.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  </>
);

const TestimonialsPage = () => (
  <>
    <PageHero
      eyebrow="Depoimentos"
      title="Resultados percebidos por quem estuda com acompanhamento"
      description="Depoimentos reais de alunos compartilhando como as aulas, a metodologia e o acompanhamento impactam a evolução no inglês."
    />

    <section className="bg-neutral-50 px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="grid gap-6 md:grid-cols-2">
            {testimonialVideos.map((video) => (
              <Reveal key={video.src}>
                <article className="overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white shadow-sm">
                  <div className="border-b border-neutral-100 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold tracking-tight text-neutral-950">{video.title}</p>
                        <p className="mt-1 text-sm text-neutral-500">{video.subtitle}</p>
                      </div>
                      <div className="flex gap-1 text-neutral-950" aria-label="5 estrelas">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Star key={index} size={15} fill="currentColor" />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-black p-3">
                    <video
                      className="aspect-[9/16] w-full rounded-[1.2rem] object-cover"
                      src={video.src}
                      controls
                      playsInline
                      preload="metadata"
                    >
                      Seu navegador não suporta vídeo em HTML5.
                    </video>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>

          <Reveal>
            <div className="flex h-full flex-col justify-between rounded-[1.75rem] border border-neutral-200 bg-white p-8 shadow-sm">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white">
                  <Sparkles size={14} />
                  Prova social real
                </div>
                <h3 className="mt-6 text-3xl font-semibold tracking-tight text-neutral-950">
                  Depoimentos que reforçam a experiência da escola
                </h3>
                <p className="mt-5 leading-8 text-neutral-600">
                  Em vez de promessas genéricas, o site mostra alunos falando sobre as aulas com autenticidade. Isso aumenta confiança e aproxima a escola de quem está avaliando começar.
                </p>
              </div>

              <div className="mt-8 space-y-4">
                {[
                  "Vídeos reais integrados diretamente na página",
                  "Formato vertical otimizado para mobile e desktop",
                  "Seção pronta para receber mais depoimentos depois",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-2xl bg-neutral-50 p-4">
                    <Check size={18} className="mt-0.5 text-emerald-600" />
                    <p className="text-sm leading-6 text-neutral-700">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  </>
);

const TeacherPage = () => (
  <>
    <PageHero
      eyebrow="Professor"
      title="Conheça Gabriel Gaeski"
      description="Professor e fundador da Best Part School, com experiência em vendas internacionais, tradução, interpretação e ensino personalizado."
    />

    <section className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <Reveal>
          <div className="mx-auto max-w-md">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] border border-neutral-200 bg-neutral-100 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
              <img
                src={teacherPhotoSrc}
                alt="Professor Gabriel Gaeski"
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-neutral-950 via-neutral-950/70 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6 rounded-2xl border border-white/10 bg-neutral-950/78 p-5 shadow-xl backdrop-blur-xl">
                <p className="text-xs uppercase tracking-[0.24em] text-neutral-300">Professor e fundador</p>
                <p className="mt-2 text-xl font-semibold tracking-tight text-white">Gabriel Gaeski</p>
                <p className="mt-2 text-sm text-neutral-200">Ensino prático, humano e personalizado</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { value: "+500", label: "aulas" },
                { value: "+5", label: "anos de experiência" },
                { value: "+100", label: "alunos" },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
                  <p className="text-3xl font-semibold tracking-tight">{item.value}</p>
                  <p className="mt-1 text-sm text-neutral-500">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500">Conheça o professor</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl lg:text-5xl">
              Inglês que nasceu da prática e virou propósito
            </h2>
            <div className="mt-8 space-y-6 text-base leading-8 text-neutral-600 sm:text-lg">
              <p>
                Sou Gabriel Gaeski, professor e fundador da Best Part School. Sou cristão e acredito que ensinar vai muito além de explicar regras: é ajudar pessoas a conquistarem confiança, independência e novas oportunidades por meio do inglês.
              </p>
              <p>
                Antes de me dedicar ao ensino, trabalhei por dois anos com vendas internacionais, participando de reuniões, negociações e ligações com clientes de diferentes partes do mundo. Também atuei como tradutor em feiras internacionais e como intérprete em reuniões privadas.
              </p>
              <p>
                Hoje, uso toda essa vivência em minhas aulas. Meu objetivo não é fazer o aluno apenas decorar estruturas, mas prepará-lo para conversar, trabalhar, viajar, participar de reuniões e se comunicar com segurança em situações reais.
              </p>
              <p>
                Na Best Part School, cada aula é construída para respeitar o nível, a rotina e os objetivos de cada aluno.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  </>
);

const ContactPage = () => (
  <>
    <PageHero
      eyebrow="Contato"
      title="Comece sua jornada no inglês hoje"
      description="Agende uma conversa para entender o melhor plano para seu objetivo ou acesse a área do aluno se você já faz parte da escola."
    />

    <section className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <Reveal>
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-neutral-950 p-8 text-white shadow-2xl sm:p-12 lg:p-16">
          <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-400">Atendimento</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                Fale com a Best Part School
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-neutral-300">
                Clique para agendar uma aula ou entre na área do aluno se você já possui acesso.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Button asChild size="lg" className="h-12 rounded-full bg-white text-neutral-950 hover:bg-neutral-200">
                <a href={contactUrl}>Agendar aula</a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-full border-white/20 bg-transparent text-white hover:bg-white hover:text-neutral-950"
              >
                <Link to="/login">Entrar na Área do Aluno</Link>
              </Button>
            </div>
          </div>
        </div>
      </Reveal>
    </section>

    <section className="bg-neutral-50 px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.75fr_1.25fr]">
        <Reveal>
          <SectionHeader
            align="left"
            eyebrow="FAQ"
            title="Perguntas comuns antes de começar"
            description="Respostas diretas sobre aulas, materiais, acompanhamento e organização do estudo."
          />
        </Reveal>

        <Reveal>
          <Accordion type="single" collapsible className="rounded-2xl border border-neutral-200 bg-white px-5 shadow-sm">
            {faqs.map((faq, index) => (
              <AccordionItem key={faq.question} value={`faq-${index}`} className="border-neutral-200">
                <AccordionTrigger className="text-left text-base font-semibold hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="leading-7 text-neutral-600">{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  </>
);

const SiteFooter = () => (
  <footer className="border-t border-neutral-200 bg-white px-4 py-12 sm:px-6 lg:px-8">
    <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
      <div>
        <div className="flex items-center gap-3">
          <img src={logoSrc} alt="Best Part School" className="h-12 w-12 object-contain" loading="lazy" />
          <div>
            <p className="font-semibold tracking-tight">Best Part School</p>
            <p className="text-sm text-neutral-500">Inglês personalizado e inteligente</p>
          </div>
        </div>
        <p className="mt-5 max-w-sm leading-7 text-neutral-600">
          Escola de inglês com aulas personalizadas, acompanhamento individual e plataforma de estudos.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Páginas</h3>
        <div className="mt-4 space-y-3">
          {navItems.slice(0, 4).map((item) => (
            <Link key={item.to} to={item.to} className="block text-sm text-neutral-700 hover:text-neutral-950">
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Redes</h3>
        <div className="mt-4 space-y-3">
          <Link to={PUBLIC_PATHS.contact} className="block text-sm text-neutral-700 hover:text-neutral-950">
            Instagram
          </Link>
          <Link to={PUBLIC_PATHS.contact} className="block text-sm text-neutral-700 hover:text-neutral-950">
            WhatsApp
          </Link>
          <Link to={PUBLIC_PATHS.contact} className="block text-sm text-neutral-700 hover:text-neutral-950">
            LinkedIn
          </Link>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Contato</h3>
        <div className="mt-4 space-y-3 text-sm text-neutral-700">
          <p>contato@bestpartschool.com</p>
          <p>Atendimento online</p>
          <Link to="/login" className="inline-flex items-center gap-2 font-semibold text-neutral-950">
            Área do Aluno
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>

    <div className="mx-auto mt-10 flex max-w-7xl flex-col gap-3 border-t border-neutral-200 pt-6 text-sm text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
      <p>© {new Date().getFullYear()} Best Part School. Todos os direitos reservados.</p>
      <p>Site institucional</p>
    </div>
  </footer>
);

const LandingPage = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const currentPage = getCurrentPage(location.pathname);

  const { data: marketplaceCourses = [], isLoading: isLoadingCourses } = useQuery({
    queryKey: ["courses"],
    queryFn: fetchCourses,
    enabled: currentPage === "courses",
  });

  const paidCourses = useMemo(() => marketplaceCourses.filter(isPaidCourse), [marketplaceCourses]);

  useEffect(() => {
    document.title = pageMeta[currentPage].title;
    setMetaTag("description", pageMeta[currentPage].description);
    setMetaTag("robots", "index, follow");
  }, [currentPage]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    setIsMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll(".landing-reveal"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16 },
    );

    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, [currentPage, paidCourses.length]);

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <div className="min-h-screen bg-white text-neutral-950">
      <SiteHeader
        closeMenu={closeMenu}
        currentPage={currentPage}
        isMenuOpen={isMenuOpen}
        setIsMenuOpen={setIsMenuOpen}
      />

      <main>
        {currentPage === "home" ? <HomePage /> : null}
        {currentPage === "courses" ? (
          <CoursesPage paidCourses={paidCourses} isLoadingCourses={isLoadingCourses} />
        ) : null}
        {currentPage === "methodology" ? <MethodologyPage /> : null}
        {currentPage === "testimonials" ? <TestimonialsPage /> : null}
        {currentPage === "teacher" ? <TeacherPage /> : null}
        {currentPage === "contact" ? <ContactPage /> : null}
      </main>

      <SiteFooter />
    </div>
  );
};

export default LandingPage;
