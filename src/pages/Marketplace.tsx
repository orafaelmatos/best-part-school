import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import { courses } from "@/data/mockData";

const Marketplace = () => {
  const studentCourses = courses.filter((c) => c.category === "students");
  const visitorCourses = courses.filter((c) => c.category === "visitors");

  const CourseCard = ({ course }: { course: typeof courses[0] }) => (
    <div className="border border-border rounded-xl bg-card p-6 flex flex-col sidebar-transition hover:shadow-sm">
      <div className="text-4xl mb-4">{course.image}</div>
      <h3 className="font-semibold text-card-foreground mb-1">{course.title}</h3>
      <p className="text-sm text-muted-foreground mb-4 flex-1">{course.description}</p>

      <div className="flex items-center gap-2 mb-4">
        {course.isFree ? (
          <span className="px-3 py-1 rounded-full bg-success/10 text-success text-xs font-semibold">Grátis</span>
        ) : (
          <>
            <span className="text-lg font-bold text-foreground">R$ {course.price.toFixed(2)}</span>
            {course.originalPrice && (
              <span className="text-sm text-muted-foreground line-through">R$ {course.originalPrice.toFixed(2)}</span>
            )}
          </>
        )}
        {course.discount && (
          <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
            -{course.discount}%
          </span>
        )}
      </div>

      <button className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 sidebar-transition">
        {course.isFree ? "Acessar" : "Comprar"}
      </button>
    </div>
  );

  return (
    <DashboardLayout>
      <PageHeader title="Marketplace" description="Cursos e materiais para acelerar seu aprendizado." />

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-foreground mb-4">Para alunos</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {studentCourses.map((c) => <CourseCard key={c.id} course={c} />)}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">Para visitantes</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visitorCourses.map((c) => <CourseCard key={c.id} course={c} />)}
        </div>
      </section>
    </DashboardLayout>
  );
};

export default Marketplace;
