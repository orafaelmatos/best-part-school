import { Gamepad2 } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import VocabularyDashboard from "@/components/VocabularyDashboard";
import { IconTile, ListGroup, ListItem, Screen, ScreenTitle, SectionHeader } from "@/components/student/ui";
import { APP_PATHS } from "@/lib/routes";

const PalavrasAprendidas = () => {
  return (
    <DashboardLayout>
      <Screen>
        <ScreenTitle
          title="Revise o que você aprendeu"
          description="Palavras e expressões das suas aulas, prontas para revisar."
        />

        <VocabularyDashboard />

        <section aria-labelledby="vocabulary-practice-title">
          <SectionHeader id="vocabulary-practice-title" title="Outra forma de praticar" />
          <ListGroup>
            <ListItem
              to={APP_PATHS.vocabularyGame}
              leading={<IconTile icon={Gamepad2} />}
              title="Jogo de vocabulário"
              description="Suas palavras em fases curtas de revisão, com vidas e progresso."
            />
          </ListGroup>
        </section>
      </Screen>
    </DashboardLayout>
  );
};

export default PalavrasAprendidas;
