import type { Metadata } from "next";
import { WebGPUViewer } from "@/components/webgpu/webgpu-viewer";
import { InfoCards } from "@/components/info-cards";
import { technos } from "@/lib/technos";

export const metadata: Metadata = {
  title: "WebGPU — 3D Web Tech Explorer",
  description:
    "Rendering the Damaged Helmet with the raw WebGPU API: WGSL shaders, explicit command encoders, bind groups — the next-generation GPU API for the web.",
};

export default function WebGPUPage() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">WebGPU</h1>
        <p className="text-sm text-muted-foreground mt-1">
          The next-generation browser GPU API. Explicit command encoding, WGSL shaders,
          compute support — lower overhead than WebGL, modern architecture.
        </p>
      </div>
      <WebGPUViewer />
      <InfoCards cards={technos.find(t => t.slug === "webgpu")?.infoCards} />
    </div>
  );
}
