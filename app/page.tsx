import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { technos } from "@/lib/technos";

export const metadata: Metadata = {
  title: "3D Web Tech Explorer",
  description: "Compare WebGL and 3D rendering technologies for the web",
};

export default function RootPage() {
  redirect(`/${technos[0].slug}`);
}
