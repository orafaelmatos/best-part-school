import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  Quote,
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

const logoSrc = "/img/bps-logo.png";

const navItems = [
  { label: "Início", href: "#inicio" },
  { label: "Cursos", href: "#cursos" },
  { label: "Metodologia", href: "#metodologia" },
  { label: "Depoimentos", href: "#depoimentos" },
  { label: "Professor", href: "#professor" },
  { label: "Contato", href: "#contato" },
];

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
    icon: Sparkles,
    title: "Aprendizado inteligente",
    text: "As aulas combinam prática guiada, revisões frequentes e foco em retenção de longo prazo.",
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

const testimonials = [
  {
    name: "Mariana Lopes",
    course: "Conversação",
    text: "As aulas destravaram minha fala. O acompanhamento individual fez toda diferença para eu manter consistência.",
  },
  {
    name: "Rafael Costa",
    course: "Inglês para trabalho",
    text: "Consegui melhorar minhas reuniões em inglês em poucas semanas. As simulações são muito práticas.",
  },
  {
    name: "Bianca Alves",
    course: "Inglês básico",
    text: "Eu tinha medo de começar, mas a metodologia é muito clara e respeita meu ritmo.",
  },
  {
    name: "Lucas Ferreira",
    course: "Entrevistas",
    text: "Treinei respostas, vocabulário e postura. Cheguei muito mais confiante na entrevista.",
  },
  {
    name: "Camila Rocha",
    course: "Intermediário",
    text: "A plataforma ajuda bastante nas revisões. Sinto que agora eu realmente lembro do que aprendo.",
  },
  {
    name: "Daniel Martins",
    course: "Viagens",
    text: "As aulas foram objetivas e me deram segurança para lidar com situações reais fora do país.",
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

const LandingPage = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { data: marketplaceCourses = [], isLoading: isLoadingCourses } = useQuery({
    queryKey: ["courses"],
    queryFn: fetchCourses,
  });
  const paidCourses = marketplaceCourses.filter(isPaidCourse);

  useEffect(() => {
    document.title = "Best Part School | Inglês personalizado e inteligente";
    setMetaTag(
      "description",
      "Aprenda inglês com aulas personalizadas, revisões inteligentes, flashcards e acompanhamento individual na Best Part School.",
    );
    setMetaTag("robots", "index, follow");

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
  }, [paidCourses.length]);

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <div className="min-h-screen scroll-smooth bg-white text-neutral-950">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-neutral-950/90 text-white shadow-[0_20px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="#inicio" className="flex items-center gap-3" aria-label="Best Part School">
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
          </a>

          <div className="hidden items-center gap-7 lg:flex">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-neutral-300 transition hover:text-white"
              >
                {item.label}
              </a>
            ))}
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
          <div className="border-t border-white/10 bg-neutral-950 px-4 pb-5 pt-2 lg:hidden">
            <div className="mx-auto flex max-w-7xl flex-col gap-1">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={closeMenu}
                  className="rounded-lg px-3 py-3 text-sm font-medium text-neutral-300 transition hover:bg-white/10 hover:text-white"
                >
                  {item.label}
                </a>
              ))}
              <Button asChild className="mt-3 h-11 rounded-full bg-white text-neutral-950 hover:bg-neutral-200">
                <Link to="/login" onClick={closeMenu}>
                  Área do Aluno
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        )}
      </header>

      <main>
        <section
          id="inicio"
          className="relative overflow-hidden bg-neutral-950 px-4 pb-20 pt-32 text-white sm:px-6 lg:px-8 lg:pb-28 lg:pt-40"
        >
          <div className="absolute inset-0 opacity-40">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
            <div className="absolute left-1/2 top-20 h-[520px] w-[520px] -translate-x-1/2 rounded-full border border-white/10" />
            <div className="absolute left-1/2 top-36 h-[360px] w-[360px] -translate-x-1/2 rounded-full border border-white/10" />
          </div>

          <div className="relative mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
            <Reveal>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium uppercase tracking-[0.22em] text-neutral-300">
                <Sparkles size={14} />
                Inglês premium e personalizado
              </div>
              <h1 className="mt-8 max-w-4xl text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
                Aprenda inglês de forma inteligente e definitiva
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-neutral-300 sm:text-xl">
                Aulas personalizadas, metodologia prática, acompanhamento individual e tecnologia para acelerar seu aprendizado com revisão inteligente.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="h-12 rounded-full bg-white px-7 text-neutral-950 hover:bg-neutral-200"
                >
                  <a href="#contato">
                    Começar agora
                    <ArrowRight />
                  </a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-full border-white/20 bg-transparent px-7 text-white hover:bg-white hover:text-neutral-950"
                >
                  <a href="#cursos">Conhecer cursos</a>
                </Button>
              </div>
            </Reveal>

            <Reveal className="lg:justify-self-end">
              <div className="relative mx-auto w-full max-w-xl">
                <div className="rounded-[2rem] border border-white/12 bg-white/[0.06] p-4 shadow-2xl backdrop-blur">
                  <div className="rounded-[1.5rem] bg-white p-5 text-neutral-950 shadow-2xl">
                    <div className="flex items-center justify-between border-b border-neutral-100 pb-5">
                      <div className="flex items-center gap-3">
                        <img src={logoSrc} alt="" className="h-12 w-12 object-contain" loading="lazy" />
                        <div>
                          <p className="text-sm font-semibold">Plano de fluência</p>
                          <p className="text-xs text-neutral-500">Semana atual</p>
                        </div>
                      </div>
                      <span className="rounded-full bg-neutral-950 px-3 py-1 text-xs font-medium text-white">
                        Ativo
                      </span>
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      {stats.map((stat) => (
                        <div key={stat.label} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                          <p className="text-2xl font-semibold tracking-tight">{stat.value}</p>
                          <p className="mt-1 text-sm text-neutral-500">{stat.label}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 rounded-2xl bg-neutral-950 p-5 text-white">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">Revisão inteligente</p>
                        <Zap size={18} />
                      </div>
                      <div className="mt-5 space-y-3">
                        {["Speaking practice", "Vocabulary review", "Homework feedback"].map((item, index) => (
                          <div key={item} className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-semibold text-neutral-950">
                              {index + 1}
                            </div>
                            <div className="h-2 flex-1 rounded-full bg-white/15">
                              <div
                                className="h-2 rounded-full bg-white"
                                style={{ width: `${78 - index * 13}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="absolute -bottom-5 left-4 hidden rounded-2xl border border-white/15 bg-neutral-950/95 p-4 text-white shadow-xl sm:block">
                  <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Foco da semana</p>
                  <p className="mt-1 text-sm font-semibold">Conversação e retenção real</p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section id="sobre" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <Reveal>
              <SectionHeader
                eyebrow="Sobre a escola"
                title="Uma escola criada para transformar estudo em evolução consistente"
                description="A Best Part School combina ensino humano, estrutura clara e tecnologia para que cada aluno avance com confiança, sem perder tempo com conteúdos genéricos."
              />
            </Reveal>

            <div className="mt-14 grid gap-4 md:grid-cols-3">
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

        <section id="cursos" className="bg-neutral-50 px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <Reveal>
              <SectionHeader
                eyebrow="Cursos disponiveis"
                title="Cursos pagos do marketplace"
                description="Escolha um curso disponível para compra. Os cursos gratuitos ficam reservados para alunos dentro da plataforma."
              />
            </Reveal>

            {isLoadingCourses ? (
              <p className="mt-14 text-center text-neutral-600">Carregando cursos...</p>
            ) : paidCourses.length === 0 ? (
              <p className="mt-14 text-center text-neutral-600">Nenhum curso pago disponível no momento.</p>
            ) : (
              <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                        <a
                          href="#contato"
                          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-neutral-950"
                        >
                          Saiba mais
                          <ChevronRight size={16} className="transition group-hover:translate-x-1" />
                        </a>
                      </article>
                    </Reveal>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section id="metodologia" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
              <Reveal>
                <SectionHeader
                  align="left"
                  eyebrow="Metodologia"
                  title="Aprenda, pratique, revise e evolua com clareza"
                  description="O ensino é progressivo, com aulas acompanhadas, flashcards, revisões inteligentes, atividades personalizadas e foco em retenção real."
                />
              </Reveal>

              <div className="grid gap-4 sm:grid-cols-2">
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

        <section id="professor" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <Reveal>
              <div className="relative mx-auto aspect-[4/5] max-w-md overflow-hidden rounded-[2rem] bg-neutral-100">
                <div className="absolute inset-6 rounded-[1.5rem] border border-neutral-200 bg-white shadow-sm" />
                <div className="absolute inset-x-0 bottom-0 h-2/3 bg-neutral-950" />
                <div className="absolute left-1/2 top-16 h-32 w-32 -translate-x-1/2 rounded-full bg-neutral-300" />
                <div className="absolute bottom-16 left-1/2 h-56 w-64 -translate-x-1/2 rounded-t-full bg-neutral-200" />
                <div className="absolute bottom-6 left-6 right-6 rounded-2xl bg-white p-5 shadow-xl">
                  <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">Professor</p>
                  <p className="mt-2 text-xl font-semibold tracking-tight">Nome do Professor</p>
                  <p className="mt-2 text-sm text-neutral-600">Especialista em ensino personalizado</p>
                </div>
              </div>
            </Reveal>

            <Reveal>
              <SectionHeader
                align="left"
                eyebrow="Professor"
                title="Ensino próximo, direcionado e fácil de adaptar depois"
                description="Professor especializado em ensino personalizado e desenvolvimento de fluência prática, com aulas orientadas a objetivos reais e feedback constante."
              />
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {[
                  { value: "+100", label: "alunos" },
                  { value: "+5", label: "anos de experiencia" },
                  { value: "+500", label: "aulas" },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
                    <p className="text-3xl font-semibold tracking-tight">{item.value}</p>
                    <p className="mt-1 text-sm text-neutral-500">{item.label}</p>
                  </div>
                ))}
              </div>
              <p className="mt-8 leading-8 text-neutral-600">
                A biografia pode ser substituída facilmente por uma versão final com formação, certificações,
                especialidades e história da escola. A estrutura já está pronta para destacar autoridade e confiança.
              </p>
            </Reveal>
          </div>
        </section>

        <section id="depoimentos" className="bg-neutral-50 px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <Reveal>
              <SectionHeader
                eyebrow="Depoimentos"
                title="Resultados percebidos por quem estuda com acompanhamento"
                description="Relatos ficticios para validar a estrutura visual. Eles podem ser trocados pelos depoimentos reais da escola quando estiverem disponiveis."
              />
            </Reveal>

            <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {testimonials.map((testimonial) => (
                <Reveal key={testimonial.name}>
                  <article className="h-full rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1 text-neutral-950" aria-label="5 estrelas">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Star key={index} size={16} fill="currentColor" />
                        ))}
                      </div>
                      <Quote size={22} className="text-neutral-300" />
                    </div>
                    <p className="mt-5 leading-7 text-neutral-700">"{testimonial.text}"</p>
                    <div className="mt-6 border-t border-neutral-100 pt-5">
                      <p className="font-semibold">{testimonial.name}</p>
                      <p className="mt-1 text-sm text-neutral-500">{testimonial.course}</p>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="contato" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <Reveal>
            <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-neutral-950 p-8 text-white shadow-2xl sm:p-12 lg:p-16">
              <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-400">Comece hoje</p>
                  <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                    Comece sua jornada no inglês hoje
                  </h2>
                  <p className="mt-5 max-w-2xl text-lg leading-8 text-neutral-300">
                    Agende uma conversa para entender o melhor plano para seu objetivo ou acesse a área do aluno se você já faz parte da escola.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                  <Button asChild size="lg" className="h-12 rounded-full bg-white text-neutral-950 hover:bg-neutral-200">
                    <a href="mailto:contato@bestpartschool.com">Agendar aula</a>
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
      </main>

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
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Links</h3>
            <div className="mt-4 space-y-3">
              {navItems.slice(0, 4).map((item) => (
                <a key={item.href} href={item.href} className="block text-sm text-neutral-700 hover:text-neutral-950">
                  {item.label}
                </a>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Redes</h3>
            <div className="mt-4 space-y-3">
              <a href="#contato" className="block text-sm text-neutral-700 hover:text-neutral-950">
                Instagram
              </a>
              <a href="#contato" className="block text-sm text-neutral-700 hover:text-neutral-950">
                WhatsApp
              </a>
              <a href="#contato" className="block text-sm text-neutral-700 hover:text-neutral-950">
                LinkedIn
              </a>
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
          <p>Landing page institucional</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
