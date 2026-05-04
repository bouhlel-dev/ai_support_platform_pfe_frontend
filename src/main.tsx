import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ThemeProvider } from "next-themes";
import "./shared/i18n/i18n";
import { DirectionSync } from "./shared/i18n/DirectionSync";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={true}>
    <DirectionSync />
    <App />
  </ThemeProvider>,
);
