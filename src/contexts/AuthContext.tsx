import React, { createContext, useContext, useState, useEffect } from "react";
import { jwtDecode } from "jwt-decode";
import { api } from "@/lib/api";

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
  login: (token: string) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkToken = () => {
      const token = localStorage.getItem("token");
      if (token) {
        try {
          const decoded = jwtDecode<UserPayload>(token);
          // Check expiration
          if (decoded.exp * 1000 < Date.now()) {
            localStorage.removeItem("token");
            setUser(null);
          } else {
            setUser(decoded);
            api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
          }
        } catch (error) {
          console.error("Invalid token", error);
          localStorage.removeItem("token");
        }
      }
      setIsLoading(false);
    };

    checkToken();
  }, []);

  const login = (token: string) => {
    localStorage.setItem("token", token);
    const decoded = jwtDecode<UserPayload>(token);
    setUser(decoded);
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
    delete api.defaults.headers.common["Authorization"];
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
