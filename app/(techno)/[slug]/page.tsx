import { technos } from "@/lib/technos";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { InfoCards } from "@/components/info-cards";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return technos.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const techno = technos.find((t) => t.slug === slug);
  if (!techno) return {};
  return {
    title: `${techno.name} — 3D Web Tech Explorer`,
    description: techno.description,
  };
}

export default async function TechnoPage({ params }: Props) {
  const { slug } = await params;
  const techno = technos.find((t) => t.slug === slug);
  if (!techno) notFound();

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-1 items-center justify-center text-muted-foreground border rounded-xl bg-card/50">
        <p className="text-sm">
          Content for <span className="font-semibold text-foreground">{techno.name}</span> coming soon.
        </p>
      </div>
      <InfoCards cards={techno.infoCards} />
    </div>
  );
}
