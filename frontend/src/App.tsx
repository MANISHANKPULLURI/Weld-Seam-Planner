import { useEffect, useState } from "react";
import { Home } from "./ui/Home";
import { AppShell } from "./ui/AppShell";
import { PartStep } from "./ui/steps/PartStep";
import { SeamsStep } from "./ui/steps/SeamsStep";
import { ProceduresStep } from "./ui/steps/ProceduresStep";
import { SequenceStep } from "./ui/steps/SequenceStep";
import { ReviewStep } from "./ui/steps/ReviewStep";
import Viewport from "./Viewport";
import { useStore } from "./state/store";

/**
 * track the current location hash as the route
 */
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

/**
 * show the home page or the planner for the route
 */
export default function App() {
  const hash = useHash();
  const step = useStore((s) => s.step);
  if (hash === "#/") return <Home />;
  return (
    <AppShell viewport={<Viewport />}>
      {step === "seams" ? <SeamsStep /> : step === "procedures" ? <ProceduresStep /> : step === "sequence" ? <SequenceStep /> : step === "review" ? <ReviewStep /> : <PartStep />}
    </AppShell>
  );
}
