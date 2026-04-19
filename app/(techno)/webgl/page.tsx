import type { Metadata } from "next";
import { WebGLViewer } from "@/components/raw-webgl/webgl-viewer";

export const metadata: Metadata = {
  title: "Raw WebGL — 3D Web Tech Explorer",
  description:
    "Rendering the Damaged Helmet with raw WebGL 2.0: manual GLB parsing, PBR shaders from scratch, no library abstraction.",
};

export default function WebGLPage() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Raw WebGL 2.0</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Direct GPU access via the browser's WebGL 2.0 API — no abstraction layer.
          GLB parsed manually, PBR shaders written from scratch.
        </p>
      </div>
      <WebGLViewer />
    </div>
  );
}
