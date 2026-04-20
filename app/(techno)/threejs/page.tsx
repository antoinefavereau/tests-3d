import type { Metadata } from "next";
import { ThreejsViewer } from "@/components/threejs/threejs-viewer";
import { InfoCards } from "@/components/info-cards";
import { technos } from "@/lib/technos";

export const metadata: Metadata = {
  title: "Three.js — 3D Web Tech Explorer",
  description:
    "Rendering the Damaged Helmet with Three.js: using GLTFLoader, OrbitControls (internal logic), and PBR materials.",
};

export default function ThreejsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-blue-400">
          Three.js
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          High-level 3D library that abstracts WebGL/WebGPU. First-class support
          for GLTF/GLB models and advanced PBR rendering.
        </p>
      </div>
      <ThreejsViewer />
      <InfoCards cards={technos.find((t) => t.slug === "threejs")?.infoCards} />
    </div>
  );
}
