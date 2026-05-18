import type { Metadata } from "next";
import { FilamentContent } from "./filament-content";

export const metadata: Metadata = {
  title: "Filament Benchmark | 3D Web",
  description: "High-performance PBR rendering with Google Filament (WASM)",
};

export default function FilamentPage() {
  return <FilamentContent />;
}
