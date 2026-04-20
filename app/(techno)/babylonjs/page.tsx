import type { Metadata } from "next";
import { BabylonjsViewer } from "@/components/babylonjs/babylonjs-viewer";
import { InfoCards } from "@/components/info-cards";
import { technos } from "@/lib/technos";

export const metadata: Metadata = {
  title: "Babylon.js — 3D Web Tech Explorer",
  description:
    "Rendering the Damaged Helmet with Babylon.js: featuring its high-performance engine, GLB loader, and PBR material setup.",
};

export default function BabylonjsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-blue-500">
          Babylon.js
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          A complete 3D engine providing everything from low-level rendering to
          high-level game features. Powerful inspector, physics integration, and
          robust GLTF support.
        </p>
      </div>
      <BabylonjsViewer />
      <InfoCards
        cards={technos.find((t) => t.slug === "babylonjs")?.infoCards}
      />
    </div>
  );
}
