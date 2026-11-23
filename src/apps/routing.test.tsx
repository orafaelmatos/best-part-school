import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudentRoutes } from "./student/App";
import { AdminRoutes } from "./admin/App";
import { SiteRoutes } from "./site/App";

const auth = vi.hoisted(() => ({
  user: null as null | { role: string },
  isLoading: false,
  logout: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth, AuthProvider: ({ children }) => children }));
vi.mock("@/pages/Dashboard", () => ({ default: () => <div>dashboard</div> }));
vi.mock("@/pages/PalavrasAprendidas", () => ({ default: () => <div>learned-words</div> }));
vi.mock("@/pages/Marketplace", () => ({ default: () => <div>marketplace</div> }));
vi.mock("@/pages/Pagamentos", () => ({ default: () => <div>payments</div> }));
vi.mock("@/pages/MinhasAulas", () => ({ default: () => <div>student-lessons</div> }));
vi.mock("@/pages/Homework", () => ({ default: () => <div>student-homework</div> }));
vi.mock("@/pages/JogoVocabulario", () => ({ default: () => <div>vocabulary-game</div> }));
vi.mock("@/pages/AssistenteIA", () => ({ default: () => <div>ai-practice</div> }));
vi.mock("@/pages/InterpreteIA", () => ({ default: () => <div>interpreter</div> }));
vi.mock("@/pages/Alunos", () => ({ default: () => <div>student-management</div> }));
vi.mock("@/pages/AlunoTrilha", () => ({ default: () => <div>student-track-management</div> }));
vi.mock("@/pages/CriarAluno", () => ({ default: () => <div>create-student</div> }));
vi.mock("@/pages/CorrigirHomework", () => ({ default: () => <div>homework-correction</div> }));
vi.mock("@/pages/CRM", () => ({ default: () => <div>crm</div> }));
vi.mock("@/pages/CriarAula", () => ({ default: () => <div>create-lesson</div> }));
vi.mock("@/pages/AnotarAula", () => ({ default: () => <div>annotate-lesson</div> }));
vi.mock("@/pages/Calendario", () => ({ default: () => <div>staff-calendar</div> }));
vi.mock("@/pages/CriarCurso", () => ({ default: () => <div>create-course</div> }));
vi.mock("@/pages/LandingPage", () => ({ default: () => <div>school-website</div> }));
vi.mock("@/pages/Login", () => ({ default: () => <div>login</div> }));
vi.mock("@/pages/NotFound", () => ({ default: () => <div>not-found</div> }));

function Location() {
  const { pathname, search, hash } = useLocation();
  return <output data-testid="location">{pathname}{search}{hash}</output>;
}

function open(path: string, RoutesComponent = StudentRoutes) {
  return render(<MemoryRouter initialEntries={[path]}><RoutesComponent /><Location /></MemoryRouter>);
}

beforeEach(() => {
  auth.user = { role: "student" };
  auth.isLoading = false;
  auth.logout.mockClear();
});
afterEach(cleanup);

describe("student application routing", () => {
  it("opens the student's dashboard from the app root", () => {
    open("/");
    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/app");
  });

  it("sends unauthenticated users to login without mounting a protected page", () => {
    auth.user = null;
    open("/app/homework");
    expect(screen.getByText("login")).toBeInTheDocument();
    expect(screen.queryByText("student-homework")).not.toBeInTheDocument();
  });

  it.each([
    ["/app/aulas", "student-lessons"],
    ["/app/calendario", "student-lessons"],
    ["/app/homework", "student-homework"],
    ["/app/palavras-aprendidas", "learned-words"],
    ["/app/jogo-de-vocabulario", "vocabulary-game"],
    ["/app/treinar-ia", "ai-practice"],
    ["/app/treinar-ia/conversa/session-123", "ai-practice"],
    ["/app/interprete-ia/conversa/session-456", "interpreter"],
  ])("preserves student functionality at %s", (path, page) => {
    open(path);
    expect(screen.getByText(page)).toBeInTheDocument();
  });

  it.each(["/app/financeiro", "/app/pagamentos", "/app/marketplace", "/app/alunos", "/app/aulas/nova", "/app/crm", "/app/corrigir-homework", "/cursos"]) (
    "excludes management and institutional route %s", (path) => {
      open(path);
      expect(screen.getByText("not-found")).toBeInTheDocument();
    },
  );

  it.each(["teacher", "admin"])("rejects a %s session and lets the person switch accounts", (role) => {
    auth.user = { role };
    open("/app/homework");
    expect(screen.queryByText("student-homework")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sair e trocar de conta" }));
    expect(auth.logout).toHaveBeenCalledOnce();
  });

  it("preserves a bookmarked AI conversation, query and fragment", () => {
    open("/treinar-ia/conversa/session-123?mode=speaking#latest");
    expect(screen.getByText("ai-practice")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/app/treinar-ia/conversa/session-123?mode=speaking#latest");
  });
});

describe("independent site and management routing", () => {
  it.each(["/", "/cursos", "/metodologia", "/depoimentos", "/professor", "/contato"])("keeps public page %s", (path) => {
    open(path, SiteRoutes);
    expect(screen.getByText("school-website")).toBeInTheDocument();
  });

  it.each(["/login", "/app", "/app/alunos", "/app/homework"])("excludes private page %s from the site", (path) => {
    open(path, SiteRoutes);
    expect(screen.getByText("not-found")).toBeInTheDocument();
  });

  it.each(["teacher", "admin"])("allows %s to use management", (role) => {
    auth.user = { role };
    open("/app/alunos", AdminRoutes);
    expect(screen.getByText("student-management")).toBeInTheDocument();
  });

  it("rejects a student session in management", () => {
    open("/app/alunos", AdminRoutes);
    expect(screen.queryByText("student-management")).not.toBeInTheDocument();
    expect(screen.getByText("Este painel é exclusivo para professores e administradores.")).toBeInTheDocument();
  });

  it.each(["/app/homework", "/app/treinar-ia", "/app/interprete-ia", "/app/jogo-de-vocabulario"])("excludes student route %s from management", (path) => {
    auth.user = { role: "teacher" };
    open(path, AdminRoutes);
    expect(screen.getByText("not-found")).toBeInTheDocument();
  });
});
