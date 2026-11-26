import { useRef, type ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { Camera, CreditCard, ExternalLink, LifeBuoy, Loader2, LogOut, ShoppingBag } from "lucide-react";
import axios from "axios";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useStudentProfile, studentInitials } from "@/components/student/useStudentProfile";
import { useSidebarBadges } from "@/components/SidebarBadges";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { absoluteMediaUrl } from "@/lib/config";
import { APP_PATHS } from "@/lib/routes";
import { LEGAL_PATHS } from "@/lib/privacy";
import { PUBLIC_SITE_URL, APP_TARGET } from "@/apps/target";
import StudentPrivacyPanel from "@/components/student/StudentPrivacyPanel";
import { Badge, Button, Card, IconTile, ListGroup, ListItem, Screen, SectionHeader } from "@/components/student/ui";

export default function StudentProfile() {
  const { user, logout } = useAuth();
  const query = useStudentProfile();
  const { data: badges } = useSidebarBadges(user?.role === "student" && APP_TARGET !== "student");
  const input = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const upload = useMutation({
    mutationFn: async (file: File) => { const data = new FormData(); data.append("photo", file); await api.patch(`/accounts/users/${user?.user_id}/`, data); },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["current-user-profile", user?.user_id] }); toast({ title: "Foto atualizada" }); },
    onError: (error) => { const message = axios.isAxiosError(error) ? error.response?.data?.photo?.[0] : undefined; toast({ title: "Não foi possível atualizar a foto", description: message || "Verifique sua conexão e tente novamente.", variant: "destructive" }); },
  });
  const onPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      toast({ title: "Escolha outra imagem", description: "Use uma foto JPG, PNG ou WebP de até 8 MB.", variant: "destructive" }); return;
    }
    upload.mutate(file);
  };
  if (user?.role !== "student") return <Navigate to={APP_PATHS.dashboard} replace />;
  const name = query.data?.name || user.name || "Aluno";
  const photo = absoluteMediaUrl(query.data?.photo_url);
  const level = query.data?.level || user.level;
  return (
    <DashboardLayout>
      <Screen>
        <h1 className="sr-only">Meu perfil</h1>
        <Card as="section" aria-label="Informações da conta" className="flex flex-col items-center text-center">
          <div className="relative">
            <div className="flex size-24 items-center justify-center overflow-hidden rounded-full border-4 border-surface bg-primary-light text-h2 text-primary-dark ring-1 ring-line">
              {photo ? <img src={photo} alt="Sua foto" className="h-full w-full object-cover" /> : studentInitials(name)}
            </div>
            <button
              disabled={upload.isPending}
              type="button"
              onClick={() => input.current?.click()}
              aria-label="Alterar foto de perfil"
              className="absolute -bottom-1 -right-2 flex size-11 items-center justify-center rounded-full border-4 border-surface bg-primary text-primary-foreground transition-colors duration-150 hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {upload.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Camera size={16} aria-hidden="true" />}
            </button>
          </div>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhoto} className="hidden" aria-label="Selecionar nova foto" />
          <h2 className="mt-4 text-h3 text-ink">{name}</h2>
          <p className="mt-0.5 break-all text-body text-ink-secondary">{query.data?.email || user.email}</p>
          {level && <Badge tone="primary" className="mt-3">Inglês · Nível {level}</Badge>}
          {query.isError && (
            <Button variant="ghost" size="sm" fullWidth className="mt-3" onClick={() => void query.refetch()}>Não carregamos seu perfil. Tentar novamente</Button>
          )}
        </Card>

        {APP_TARGET !== "student" && (
          <section aria-labelledby="profile-account">
            <SectionHeader id="profile-account" title="Sua conta" />
            <ListGroup>
              <ListItem
                to={APP_PATHS.finance}
                leading={<IconTile icon={CreditCard} tone="neutral" />}
                title="Financeiro"
                description="Pagamentos e contratos"
                trailing={badges?.finance?.count ? <Badge tone="warning">{badges.finance.count}</Badge> : undefined}
              />
              <ListItem to={APP_PATHS.marketplace} leading={<IconTile icon={ShoppingBag} tone="neutral" />} title="Cursos e materiais" description="Explore o catálogo da escola" />
            </ListGroup>
          </section>
        )}

        <StudentPrivacyPanel />

        <section aria-labelledby="profile-help">
          <SectionHeader id="profile-help" title="Precisa de ajuda?" />
          <ListGroup>
            {APP_TARGET === "student" ? (
              <ListItem to={LEGAL_PATHS.support} leading={<IconTile icon={LifeBuoy} />} title="Falar com o suporte" description="Dúvidas sobre aulas ou acesso à conta" />
            ) : PUBLIC_SITE_URL ? (
              <ListItem href={PUBLIC_SITE_URL} external leading={<IconTile icon={ExternalLink} />} title="Visitar o site da escola" description="Fale com seu professor para tirar dúvidas" />
            ) : (
              <ListItem leading={<IconTile icon={LifeBuoy} />} title="Fale com seu professor" description="Para dúvidas sobre aulas ou acesso à conta" />
            )}
          </ListGroup>
        </section>

        <Button variant="outline" fullWidth onClick={() => void logout()}><LogOut aria-hidden="true" />Sair da conta</Button>
        <p className="pb-2 text-center text-caption text-ink-secondary">Best Part School · Seu inglês, do seu jeito</p>
      </Screen>
    </DashboardLayout>
  );
}
