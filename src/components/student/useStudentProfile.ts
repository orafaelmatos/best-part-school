import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";

export type StudentProfileData = { id: string; name?: string; email?: string; level?: string; photo_url?: string | null };

export function useStudentProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["current-user-profile", user?.user_id],
    queryFn: async () => (await api.get<StudentProfileData>(`/accounts/users/${user?.user_id}/`)).data,
    enabled: Boolean(user?.user_id),
    staleTime: 60_000,
  });
}

export function studentInitials(name?: string) {
  return (name || "Aluno").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
