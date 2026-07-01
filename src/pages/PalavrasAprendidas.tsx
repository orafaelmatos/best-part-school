import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import VocabularyDashboard from "@/components/VocabularyDashboard";

const PalavrasAprendidas = () => {
  return (
    <DashboardLayout>
      <PageHeader title="Palavras Aprendidas" description="Revise e acompanhe as palavras e expressões aprendidas nas aulas." />
      <VocabularyDashboard />
    </DashboardLayout>
  );
};

export default PalavrasAprendidas;
