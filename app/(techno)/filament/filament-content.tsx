"use client";

import dynamic from "next/dynamic";
import { InfoCards } from "@/components/info-cards";
import { technos } from "@/lib/technos";

const FilamentViewer = dynamic(
  () => import("@/components/filament/filament-viewer").then((mod) => mod.FilamentViewer),
  { ssr: false }
);

export function FilamentContent() {
  const techno = technos.find((t) => t.id === "filament");

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-blue-400">
          Filament
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Google's real-time physically based rendering engine. Built in C++ and compiled to WASM for state-of-the-art visual quality.
        </p>
      </div>
      <FilamentViewer />
      <InfoCards cards={techno?.infoCards} />
    </div>
  );
}
