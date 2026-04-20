import type { Metadata } from "next";
import { OglViewer } from "@/components/ogl/ogl-viewer";
import { InfoCards } from "@/components/info-cards";
import { technos } from "@/lib/technos";

export const metadata: Metadata = {
  title: "OGL — 3D Web Tech Explorer",
  description:
    "Rendering the Damaged Helmet with OGL: exploring its minimalist WebGL abstraction and high-performance creative coding capabilities.",
};

export default function OglPage() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-purple-500">
          OGL
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          A minimalist WebGL library with a tiny footprint. It provides just
          enough abstraction (Scenes, Cameras, Meshes) while keeping you close
          to the metal.
        </p>
      </div>
      <OglViewer />
      <InfoCards cards={technos.find((t) => t.slug === "ogl")?.infoCards} />
    </div>
  );
}
