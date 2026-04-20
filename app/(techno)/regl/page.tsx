import type { Metadata } from "next";
import { ReglViewer } from "@/components/regl/regl-viewer";
import { InfoCards } from "@/components/info-cards";
import { technos } from "@/lib/technos";

export const metadata: Metadata = {
  title: "Regl — 3D Web Tech Explorer",
  description:
    "Rendering the Damaged Helmet with Regl: exploring functional and stateless WebGL for high-performance 3D visualization.",
};

export default function ReglPage() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-teal-400">
          Regl
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Functional and declarative WebGL. It removes the state-machine
          complexity of raw WebGL by using a stateless API based on functional
          commands. Pure performance with predictable behavior.
        </p>
      </div>
      <ReglViewer />
      <InfoCards cards={technos.find((t) => t.slug === "regl")?.infoCards} />
    </div>
  );
}
