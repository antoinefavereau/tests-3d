import type { TechnoInfoCard } from "@/lib/technos";

export function InfoCards({ cards }: { cards?: TechnoInfoCard[] }) {
  if (!cards || cards.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
      {cards.map((card, i) => (
        <div
          key={i}
          className="rounded-lg border bg-card px-4 py-3 flex flex-col gap-1"
        >
          <p className="text-xs text-muted-foreground">{card.label}</p>
          <p className={`text-base font-semibold ${card.accent}`}>
            {card.value}
          </p>
          <p className="text-xs text-muted-foreground">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
