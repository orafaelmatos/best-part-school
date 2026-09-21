import { useAuth } from "@/contexts/AuthContext";

const PageHeader = ({ title, description }: { title: string; description?: string }) => {
  const { user } = useAuth();

  return (
    <div className="min-w-0 space-y-2">
      <span className="hidden items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700 sm:inline-flex">
        {user?.role === "student" ? "Portal do aluno" : "Painel BPS"}
      </span>
      <h1 className="break-words text-2xl font-bold tracking-tight text-foreground sm:mt-4 sm:text-[2.15rem]">{title}</h1>
      {description ? (
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:leading-7 sm:text-[0.98rem]">
          {description}
        </p>
      ) : null}
    </div>
  );
};

export default PageHeader;
