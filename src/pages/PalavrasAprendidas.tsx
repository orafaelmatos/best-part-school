import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import VocabularyDashboard from "@/components/VocabularyDashboard";
import { Button } from "@/components/ui/button";
import { APP_PATHS } from "@/lib/routes";
import { Gamepad2 } from "lucide-react";
import { Link } from "react-router-dom";

const PalavrasAprendidas = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Palavras Aprendidas" description="Revise e acompanhe as palavras e expressoes aprendidas nas aulas." />

        <section className="rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(14,165,233,0.08),rgba(249,115,22,0.08),rgba(34,197,94,0.08))] p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Gamepad2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Nova area</p>
                <h2 className="mt-2 text-xl font-semibold text-foreground">Transforme os cards em fases curtas de revisao</h2>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
                  O jogo usa as palavras do proprio aluno para criar desafios simples, com vidas, progresso e reforco real da fila de estudo.
                </p>
              </div>
            </div>

            <Button asChild size="lg" className="rounded-2xl">
              <Link to={APP_PATHS.vocabularyGame}>Abrir jogo</Link>
            </Button>
          </div>
        </section>

        <VocabularyDashboard />
      </div>
    </DashboardLayout>
  );
};

export default PalavrasAprendidas;
