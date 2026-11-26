import { BookText, ClipboardList, Gamepad2, Headphones, MessageCircle } from "lucide-react";
import { Navigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useSidebarBadges } from "@/components/SidebarBadges";
import { APP_PATHS } from "@/lib/routes";
import { Badge, IconTile, ListGroup, ListItem, Screen, ScreenTitle, SectionHeader } from "@/components/student/ui";

export default function StudentStudy() {
  const { user } = useAuth();
  const { data: badges } = useSidebarBadges(user?.role === "student");
  if (user?.role !== "student") return <Navigate to={APP_PATHS.dashboard} replace />;
  const homeworkCount = badges?.homework?.count || 0;
  const reviewCount = badges?.learned_words?.count || 0;
  return (
    <DashboardLayout>
      <Screen>
        <ScreenTitle title="O que vamos praticar hoje?" description="Continue as atividades das aulas ou escolha uma prática para o seu momento." />

        <section aria-labelledby="study-activities">
          <SectionHeader id="study-activities" title="Seu estudo" />
          <ListGroup>
            <ListItem
              to={APP_PATHS.homework}
              leading={<IconTile icon={ClipboardList} size="lg" />}
              title="Atividades da aula"
              description={<>Faça as tarefas e veja o feedback do professor.{homeworkCount > 0 && <Badge tone="warning" className="mt-2 flex w-fit">{homeworkCount} {homeworkCount === 1 ? "pendente" : "pendentes"}</Badge>}</>}
            />
            <ListItem
              to={APP_PATHS.learnedWords}
              leading={<IconTile icon={BookText} size="lg" />}
              title="Meu vocabulário"
              description={<>Revise suas palavras e pratique com flashcards.{reviewCount > 0 && <Badge tone="primary" className="mt-2 flex w-fit">{reviewCount} para revisar</Badge>}</>}
            />
            <ListItem
              to={APP_PATHS.vocabularyGame}
              leading={<IconTile icon={Gamepad2} size="lg" />}
              title="Jogo de palavras"
              description="Teste o que você já aprendeu de um jeito diferente."
            />
          </ListGroup>
        </section>

        <section aria-labelledby="study-ai">
          <SectionHeader id="study-ai" title="Pratique com IA" description="No seu ritmo, quando quiser." />
          <ListGroup>
            <ListItem
              to={APP_PATHS.aiPractice}
              leading={<IconTile icon={MessageCircle} tone="ai" size="lg" />}
              title="Conversar e escrever"
              description="Speaking, escrita e revisão guiada das aulas."
            />
            <ListItem
              to={APP_PATHS.interpreter}
              leading={<IconTile icon={Headphones} tone="ai" size="lg" />}
              title="Ouvir e entender"
              description="Listening em situações do dia a dia."
            />
          </ListGroup>
        </section>
      </Screen>
    </DashboardLayout>
  );
}
