import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchCourses,
  formatCurrency,
  getDisplayPrice,
  getOriginalPrice,
  isFreeCourse,
  type MarketplaceCourse,
} from "@/lib/courses";

const Marketplace = () => {
  const { user } = useAuth();
  const { data = [], isLoading } = useQuery({
    queryKey: ["courses"],
    queryFn: fetchCourses,
  });

  const courses = Array.isArray(data) ? data : [];
  const canCreateCourse = user?.role === "teacher" || user?.role === "admin";

  const CourseCard = ({ course }: { course: MarketplaceCourse }) => {
    const originalPrice = getOriginalPrice(course);

    return (
    <div className="border border-border rounded-xl bg-card p-6 flex flex-col sidebar-transition hover:shadow-sm">
      <div className="text-4xl mb-4">{course.title?.charAt(0) || "C"}</div>
      <h3 className="font-semibold text-card-foreground mb-1">{course.title}</h3>
      <p className="text-sm text-muted-foreground mb-4 flex-1">{course.description}</p>

      <div className="flex items-center gap-2 mb-4">
        {isFreeCourse(course) ? (
          <span className="px-3 py-1 rounded-full bg-success/10 text-success text-xs font-semibold">Grátis</span>
        ) : (
          <>
            <span className="text-lg font-bold text-foreground">{formatCurrency(getDisplayPrice(course))}</span>
            {originalPrice !== null && (
               <span className="text-sm text-muted-foreground line-through">{formatCurrency(originalPrice)}</span>
            )}
          </>
        )}
      </div>

      <button className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 sidebar-transition">
        {isFreeCourse(course) ? "Acessar" : "Comprar"}
      </button>
    </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Marketplace" description="Cursos e materiais para acelerar seu aprendizado." />
        {canCreateCourse ? (
          <Link to="/cursos/novo" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg flex items-center gap-2 font-medium hover:opacity-90">
            <Plus size={18} /> Novo Curso
          </Link>
        ) : null}
      </div>

      {isLoading ? <p>Carregando cursos...</p> : (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-foreground mb-4">Todos os Cursos</h2>
          {courses.length === 0 && <p className="text-muted-foreground animate-fade-in">Nenhum curso disponível no momento.</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((c) => <CourseCard key={c.id} course={c} />)}
          </div>
        </section>
      )}
    </DashboardLayout>
  );
};
export default Marketplace;
