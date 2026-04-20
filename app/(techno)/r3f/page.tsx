import type { Metadata } from "next";
import { R3FViewer } from "@/components/r3f/r3f-viewer";
import { InfoCards } from "@/components/info-cards";
import { technos } from "@/lib/technos";

export const metadata: Metadata = {
  title: "React Three Fiber — 3D Web Tech Explorer",
  description:
    "Rendering the Damaged Helmet with React Three Fiber: declarative components, useGLTF hook, and OrbitControls from Drei.",
};

export default function R3FPage() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-pink-500">
          React Three Fiber
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          The declarative way to do Three.js. Manage your scene graph with React
          components and leverage the massive Drei ecosystem.
        </p>
      </div>
      <R3FViewer />
      <InfoCards cards={technos.find((t) => t.slug === "r3f")?.infoCards} />
    </div>
  );
}
