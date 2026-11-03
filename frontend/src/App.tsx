import { useEffect, useState } from "react";
import { Home } from "./ui/Home";
import { AppShell } from "./ui/AppShell";
import { PartStep } from "./ui/steps/PartStep";
import { SeamsStep } from "./ui/steps/SeamsStep";
import { ProjectCreation } from "./ui/components/ProjectCreation";
import Viewport from "./Viewport";
import { useStore } from "./state/store";

function useHash(): string {
  const [hash, setHash] = useState(() => location.hash || "#/");
  useEffect(() => {
    const onChange = () => {
      const h = location.hash || "#/";
      if (h !== "#/" && h !== "#/planner") { location.hash = "#/"; return; }
      setHash(h);
    };
    window.addEventListener("hashchange", onChange);
    onChange();
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  const step = useStore((s) => s.step);
  const projectId = useStore((s) => s.projectId);
  if (hash === "#/") return <Home />;
  return (
    <AppShell viewport={<Viewport />}>
      {!projectId ? <ProjectCreation /> : step === "seams" ? <SeamsStep /> : <PartStep />}
    </AppShell>
  );
}
