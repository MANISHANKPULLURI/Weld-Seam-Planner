import { useStore } from "../../state/store";
import { CheckProgress } from "../components/CheckProgress";
import { HealthCard } from "../components/HealthCard";
import { OrientCard } from "../components/OrientCard";
import { SingleStlFlow } from "../components/SingleStlFlow";
import { MultiStlFlow } from "../components/MultiStlFlow";
import { UnitSelector } from "../components/UnitSelector";
import { AssemblyTree } from "../components/AssemblyTree";
import { ComponentProperties } from "../components/ComponentProperties";
import { AssemblyToolbar } from "../components/AssemblyToolbar";
import { useState, useEffect } from "react";

export function PartStep() {
  const phase = useStore((s) => s.phase);
  const inputMode = useStore((s) => s.inputMode);
  const components = useStore((s) => s.components);

  if (phase === "analysing" || phase === "repairing") return <CheckProgress />;

  if (inputMode === "multiple") {
    const hasAssembly = components.some((c) => c.status === "validated");
    if (hasAssembly) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <MultiStlFlow />
          <AssemblyToolbarWrapper />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <AssemblyTree />
            <ComponentProperties />
          </div>
          <OrientCard />
        </div>
      );
    }
    if (phase === "checked" || phase === "error") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <MultiStlFlow />
          <OrientCard />
        </div>
      );
    }
    return <MultiStlFlow />;
  }

  if (inputMode === "single") {
    if (phase === "checked" || phase === "error") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SingleStlFlow />
          <HealthCard />
          <OrientCard />
        </div>
      );
    }
    return <SingleStlFlow />;
  }

  if (phase === "checked" || phase === "error") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <HealthCard />
        <OrientCard />
        <UnitSelector />
      </div>
    );
  }
  return <SingleStlFlow />;
}

function AssemblyToolbarWrapper() {
  const [ctrl, setCtrl] = useState<{ fitModel: (a?: boolean) => void; fitSelected: () => void } | null>(null);
  useEffect(() => {
    const t = setInterval(() => {
      const cand = (window as unknown as { __sceneController?: { fitModel: (a?: boolean) => void; fitSelected: () => void } }).__sceneController;
      if (cand) { setCtrl(cand); clearInterval(t); }
      const host = document.querySelector(".viewport-canvas") as unknown as { __sceneController?: { fitModel: (a?: boolean) => void; fitSelected: () => void } } | null;
      const cand2 = host?.__sceneController;
      if (cand2) { setCtrl(cand2); clearInterval(t); }
    }, 300);
    return () => clearInterval(t);
  }, []);
  return <AssemblyToolbar controller={ctrl} />;
}
