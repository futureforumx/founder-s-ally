import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { OnboardingState } from "./types";
import {
  STAGES, REVENUE_BANDS, COFOUNDER_OPTIONS, SUPERPOWERS,
  TARGET_RAISES, ROUND_TYPES, SECTOR_OPTIONS,
} from "./types";

interface StepCompanyDNAProps {
  state: OnboardingState;
  update: (p: Partial<OnboardingState>) => void;
  onNext: () => void;
  onBack: () => void;
}

function PillSelector({ options, value, onChange, multi }: {
  options: string[];
  value: string | string[];
  onChange: (v: any) => void;
  multi?: boolean;
}) {
  const isSelected = (opt: string) =>
    multi ? (value as string[]).includes(opt) : value === opt;

  const toggle = (opt: string) => {
    if (multi) {
      const arr = value as string[];
      onChange(arr.includes(opt) ? arr.filter((v) => v !== opt) : [...arr, opt]);
    } else {
      onChange(opt === value ? "" : opt);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => toggle(opt)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
            isSelected(opt)
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-muted-foreground border-border hover:border-primary/40"
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export function StepCompanyDNA({ state, update, onNext, onBack }: StepCompanyDNAProps) {
  const [date, setDate] = useState<Date | undefined>(
    state.targetCloseDate ? new Date(state.targetCloseDate) : undefined
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-lg mx-auto space-y-6"
    >
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Your Company</h1>
        <p className="text-sm text-muted-foreground">Tell us about what you're building.</p>
      </div>

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Company Name</label>
            <Input value={state.companyName} onChange={(e) => update({ companyName: e.target.value })} placeholder="Acme Corp" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Role / Title</label>
            <Input value={state.role} onChange={(e) => update({ role: e.target.value })} placeholder="CEO & Co-founder" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Stage</label>
          <PillSelector options={STAGES} value={state.stage} onChange={(v: string) => update({ stage: v })} />
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Sector</label>
          <PillSelector options={SECTOR_OPTIONS} value={state.sectors} onChange={(v: string[]) => update({ sectors: v })} multi />
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Revenue Band</label>
          <PillSelector options={REVENUE_BANDS} value={state.revenueBand} onChange={(v: string) => update({ revenueBand: v })} />
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Co-founders</label>
          <PillSelector options={COFOUNDER_OPTIONS} value={state.cofounderCount} onChange={(v: string) => update({ cofounderCount: v })} />
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Superpowers <span className="text-muted-foreground/50">(pick up to 3)</span></label>
          <PillSelector
            options={SUPERPOWERS}
            value={state.superpowers}
            onChange={(v: string[]) => update({ superpowers: v.slice(0, 3) })}
            multi
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <span className="text-sm font-medium text-foreground">Currently Raising?</span>
          <Switch
            checked={state.currentlyRaising}
            onCheckedChange={(v) => update({ currentlyRaising: v })}
          />
        </div>

        {state.currentlyRaising && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="space-y-4 pl-3 border-l-2 border-primary/20"
          >
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Target Raise</label>
              <PillSelector options={TARGET_RAISES} value={state.targetRaise} onChange={(v: string) => update({ targetRaise: v })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Round Type</label>
              <PillSelector options={ROUND_TYPES} value={state.roundType} onChange={(v: string) => update({ roundType: v })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Target Close Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-sm", !date && "text-muted-foreground")}>
                    <CalendarIcon className="h-3.5 w-3.5 mr-2" />
                    {date ? format(date, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => { setDate(d); update({ targetCloseDate: d?.toISOString() || "" }); }}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </motion.div>
        )}
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>Back</Button>
        <Button size="sm" onClick={onNext}>Continue</Button>
      </div>
    </motion.div>
  );
}
