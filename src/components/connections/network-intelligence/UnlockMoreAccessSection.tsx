import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UnlockAccessCard } from "@/lib/networkIntelligenceViewModel";
import { NETWORK_INTELLIGENCE_COPY } from "@/lib/networkIntelligenceViewModel";

export type UnlockCardResolved = UnlockAccessCard & {
  iconUrl?: string;
  onConnect: () => void;
  disabled?: boolean;
};

type Props = {
  cards: UnlockCardResolved[];
};

export function UnlockMoreAccessSection({ cards }: Props) {
  if (cards.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{NETWORK_INTELLIGENCE_COPY.unlockSectionTitle}</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">Each connection tightens trust and timing for intros.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, i) => (
          <motion.div
            key={card.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * i }}
            className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-secondary/60">
              {card.iconUrl ? (
                <img src={card.iconUrl} alt="" className="h-5 w-5 object-contain" />
              ) : (
                <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
              )}
            </div>
            <p className="text-sm font-semibold text-foreground">{card.title}</p>
            <p className="mt-1 flex-1 text-[11px] leading-relaxed text-muted-foreground">{card.benefit}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 h-8 rounded-lg text-xs font-semibold"
              onClick={card.onConnect}
              disabled={card.disabled}
            >
              Connect
            </Button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
