import "@fontsource-variable/plus-jakarta-sans";
import { createRoot } from "react-dom/client";
import App from "@app-entry";
import "./design-system/tokens.css";
import "./index.css";
import "./design-system/theme.css";

createRoot(document.getElementById("root")!).render(<App />);
