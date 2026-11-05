import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { startPersistence } from "./lib/persist";
import { applyTheme, loadSavedTheme } from "./lib/theme";

applyTheme(loadSavedTheme());

void startPersistence();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
