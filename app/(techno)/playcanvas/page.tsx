import type { Metadata } from "next";
import { PlaycanvasViewer } from "@/components/playcanvas/playcanvas-viewer";
import { InfoCards } from "@/components/info-cards";
import { technos } from "@/lib/technos";

export const metadata: Metadata = {
  title: "PlayCanvas — 3D Web Tech Explorer",
  description:
    "Rendering the Damaged Helmet with PlayCanvas: exploring its high-performance mobile-first engine and component-based architecture.",
};

export default function PlaycanvasPage() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-red-500">
          PlayCanvas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          A lightweight and extremely fast engine focused on mobile performance
          and collaborative development. Pure JavaScript API with a powerful
          glTF loading pipeline.
        </p>
      </div>
      <PlaycanvasViewer />
      <InfoCards
        cards={technos.find((t) => t.slug === "playcanvas")?.infoCards}
      />
    </div>
  );
}
