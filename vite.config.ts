import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { validateStudentBuildConfig } from "./src/lib/buildConfig";
import { localApiProxyTarget } from "./src/lib/localDevelopment";

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const targets = ["legacy", "site", "admin", "student"];
  // Explicit commands must not be redirected by a generic .env target.
  const target = targets.includes(mode) ? mode : env.VITE_APP_TARGET || "legacy";
  if (!targets.includes(target)) throw new Error(`VITE_APP_TARGET inválido: ${target}`);
  const localApi = env.VITE_LOCAL_API === "1";
  if (localApi && (command === "build" || !["student", "admin"].includes(target))) throw new Error("VITE_LOCAL_API só pode ser usada com dev:student:local, dev:admin:local ou mobile:live:ios:local.");
  const localTarget = localApi ? localApiProxyTarget(env.BPS_LOCAL_API_PORT || "8000") : undefined;
  if (command === "build" && target === "student") validateStudentBuildConfig(env);
  const excludedPages: Record<string, string[]> = {
    site: ["Login", "Dashboard", "Alunos", "MinhasAulas", "AssistenteIA", "Pagamentos"],
    student: ["LandingPage", "Alunos", "AlunoTrilha", "CriarAluno", "CriarAula", "CriarCurso", "AnotarAula", "CRM", "CorrigirHomework", "Calendario"],
    admin: ["LandingPage", "MinhasAulas", "Homework", "JogoVocabulario", "AssistenteIA", "InterpreteIA"],
  };
  const applicationBoundaries: Plugin = {
    name: "application-boundaries",
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const moduleId of Object.keys(output.modules)) {
          for (const page of excludedPages[target] || []) {
            if (moduleId.replaceAll("\\", "/").endsWith(`/src/pages/${page}.tsx`)) {
              this.error(`O build ${target} não pode incluir a página ${page}.`);
            }
          }
        }
      }
    },
  };
  return {
    define: {
      "import.meta.env.VITE_APP_TARGET": JSON.stringify(target),
      "import.meta.env.VITE_LOCAL_API": JSON.stringify(localApi ? "1" : "0"),
    },
    build: {
      outDir: target === "legacy" ? "dist" : `dist/${target}`,
      emptyOutDir: true,
    },
    server: {
      host: "::",
      port: 8080,
      hmr: { overlay: false },
      ...(localTarget ? { proxy: {
        "/api/": { target: localTarget, changeOrigin: false },
        "/media/": { target: localTarget, changeOrigin: false },
      } } : {}),
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      applicationBoundaries,
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@app-entry": path.resolve(__dirname, `./src/apps/${target}/App.tsx`),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});
