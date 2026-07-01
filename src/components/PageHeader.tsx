import { useAuth } from "@/contexts/AuthContext";

const PageHeader = ({ title, description }: { title: string; description?: string }) => {
  const { user } = useAuth();

  return (
    <div className="space-y-2">
      <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">
        {user?.role === "student" ? "Portal do aluno" : "Painel BPS"}
      </span>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-[2.15rem]">{title}</h1>
      {description ? (
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-[0.98rem]">
          {description}
        </p>
      ) : null}
    </div>
  );
};

export default PageHeader;
