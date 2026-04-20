import type { Metadata } from "next";
import { InfoCards } from "@/components/info-cards";
import { PixiViewer } from "@/components/pixijs/pixi-viewer";
import { technos } from "@/lib/technos";

export const metadata: Metadata = {
  title: "PixiJS — 3D Web Tech Explorer",
  description:
    "Testing 3D rendering with PixiJS v8: Using custom Mesh and Shader API for direct, high-performance rendering.",
};

export default function PixiPage() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-pink-500">
          PixiJS (v8)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          The fastest 2D/3D renderer for the web. Version 8 introduces major
          WebGPU performance improvements and a flexible 3D rendering pipeline.
        </p>
      </div>
      <PixiViewer />
      <InfoCards cards={technos.find((t) => t.slug === "pixijs")?.infoCards} />
    </div>
  );
}
