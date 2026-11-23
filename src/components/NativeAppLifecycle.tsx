import { useEffect, useRef } from "react";
import { App } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { focusManager } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { APP_PATHS, LOGIN_PATH } from "@/lib/routes";

export default function NativeAppLifecycle() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const routeRef = useRef({ navigate, pathname });

  useEffect(() => {
    routeRef.current = { navigate, pathname };
  }, [navigate, pathname]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    const handles: PluginListenerHandle[] = [];
    const register = (listener: Promise<PluginListenerHandle>) => {
      void listener.then((handle) => {
        if (disposed) return handle.remove();
        handles.push(handle);
      }).catch(() => console.warn("Não foi possível registrar um evento do aplicativo."));
    };

    register(App.addListener("appStateChange", ({ isActive }) => {
      if (!disposed) focusManager.setFocused(isActive);
    }));

    if (Capacitor.getPlatform() === "android") {
      register(App.addListener("backButton", () => {
        if (disposed) return;
        const route = routeRef.current;
        if ([APP_PATHS.dashboard, LOGIN_PATH, "/"].includes(route.pathname)) {
          void App.minimizeApp().catch(() => console.warn("Não foi possível minimizar o aplicativo."));
        } else if (typeof window.history.state?.idx === "number" && window.history.state.idx > 0) {
          route.navigate(-1);
        } else {
          route.navigate(APP_PATHS.dashboard, { replace: true });
        }
      }));
    }

    return () => {
      disposed = true;
      handles.forEach((handle) => {
        void handle.remove().catch(() => console.warn("Não foi possível remover um evento do aplicativo."));
      });
      focusManager.setFocused(undefined);
    };
  }, []);

  return null;
}
