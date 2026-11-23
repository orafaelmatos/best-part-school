import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { jwtDecode } from "jwt-decode";
import { restoreAuthSession } from "@/lib/api";
import { clearSession, getSession, saveSession, subscribeSession } from "@/lib/session";
import type { SessionTokens } from "@/lib/session-storage";
import { toast } from "@/hooks/use-toast";

type Role = "student" | "teacher" | "admin";

interface UserPayload {
  user_id: string;
  email: string;
  name: string;
  role: Role;
  level?: string;
  exp: number;
}

interface AuthContextType {
  user: UserPayload | null;
  login: (access: string, refresh: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

function decodeUser(access: string): UserPayload {
  const decoded = jwtDecode<UserPayload>(access);
  if (!decoded.user_id || !["student", "teacher", "admin"].includes(decoded.role) ||
      typeof decoded.exp !== "number" || decoded.exp * 1000 <= Date.now()) {
    throw new Error("Sessão inválida. Entre novamente.");
  }
  return decoded;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const activeUserId = useRef<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    let mounted = true;
    const updateUser = (session: SessionTokens | null) => {
      if (!mounted) return;
      let next: UserPayload | null = null;
      if (session) {
        try { next = decodeUser(session.access); } catch { /* Expired sessions are renewed during restoration. */ }
      }
      if (activeUserId.current && activeUserId.current !== next?.user_id) {
        void queryClient.cancelQueries();
        queryClient.clear();
      }
      activeUserId.current = next?.user_id ?? null;
      setUser(next);
    };
    const unsubscribe = subscribeSession(updateUser);
    restoreAuthSession().catch(() => {
      if (mounted) toast({
        variant: "destructive",
        title: "Não foi possível restaurar sua sessão",
        description: "Verifique sua conexão e entre novamente se necessário.",
      });
    }).finally(() => {
      if (mounted) {
        updateUser(getSession());
        setIsLoading(false);
      }
    });
    return () => { mounted = false; unsubscribe(); };
  }, [queryClient]);

  const login = async (access: string, refresh: string) => {
    decodeUser(access);
    if (!refresh) throw new Error("Resposta de login inválida.");
    await queryClient.cancelQueries();
    queryClient.clear();
    await saveSession({ access, refresh });
  };

  const logout = async () => {
    // clearSession publishes immediately; no private screen waits for native I/O.
    try { await clearSession(); }
    catch {
      toast({
        variant: "destructive",
        title: "Erro ao remover a sessão do aparelho",
        description: "Tente sair novamente antes de fechar o aplicativo.",
      });
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
