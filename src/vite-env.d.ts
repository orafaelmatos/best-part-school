/// <reference types="vite/client" />

declare module "@app-entry" {
  import { ComponentType } from "react";
  const App: ComponentType;
  export default App;
}
