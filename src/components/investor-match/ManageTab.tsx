import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Users, Plus, Search, Settings2, DollarSign, Pencil, Check } from "lucide-react";

interface CapBacker {
  id: string;
  name: string;
  amount: number;
  amountLabel: string;
  instrument: string;
  logoLetter: string;
  date: string;
}

interface ManageTabProps {
  confirmedBackers: CapBacker[];
  totalRaised: number;
  formatCurrency: (n: number) => string;
}

export function ManageTab({ confirmedBackers, totalRaised, formatCurrency }: ManageTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Mock round settings
  const [targetRaise] = useState(2_000_000);
  const [roundStage] = useState("Pre-Seed");
  const roundProgress = totalRaised > 0 ? Math.min((totalRaised / targetRaise) * 100, 100) : 0;

  const filteredBackers = confirmedBackers.filter(b =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const startEdit = useCallback((backer: CapBacker) => {
    setEditingId(backer.id);
    setEditValue(String(backer.amount));
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Cap Table Section */}
      <div className="lg:col-span-2 rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Cap Table</h3>
            <Badge variant="secondary" className="text-[10px]">{confirmedBackers.length}</Badge>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8">
            <Plus className="h-3 w-3" /> Add Investor
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search investors or fund names…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs bg-secondary/50 border-border"
          />
        </div>

        {/* Investor list */}
        <div className="space-y-1">
          {filteredBackers.map(b => (
            <div
              key={b.id}
              className="flex items-center gap-3 rounded-xl p-3 transition-all duration-200 hover:bg-secondary/50 group"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-foreground font-semibold text-sm shrink-0">
                {b.logoLetter}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{b.name}</p>
                <p className="text-[11px] text-muted-foreground">{b.instrument} · {b.date}</p>
              </div>
              <div className="flex items-center gap-2">
                {editingId === b.id ? (
                  <div className="flex items-center gap-1">
                    <Input
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      className="h-7 w-24 text-xs"
                      autoFocus
                    />
                    <button
                      onClick={() => setEditingId(null)}
                      className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-success/10 text-success transition-colors"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="text-xs font-medium text-foreground">{b.amountLabel}</span>
                    <button
                      onClick={() => startEdit(b)}
                      className="h-7 w-7 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-secondary text-muted-foreground transition-all"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {filteredBackers.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              {searchQuery ? "No investors match your search." : "No investors added yet."}
            </p>
          )}
        </div>
      </div>

      {/* Round Settings */}
      <div className="lg:col-span-1 space-y-5">
        <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Round Settings</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Target Raise
              </label>
              <p className="text-2xl font-bold text-foreground font-mono mt-1">
                {formatCurrency(targetRaise)}
              </p>
            </div>

            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Round Stage
              </label>
              <div className="mt-1">
                <Badge className="bg-accent/10 text-accent border-0 text-xs font-medium">{roundStage}</Badge>
              </div>
            </div>

            <div className="pt-2">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
                <span>Progress</span>
                <span className="font-medium text-foreground">{formatCurrency(totalRaised)} / {formatCurrency(targetRaise)}</span>
              </div>
              <Progress value={roundProgress} className="h-2 bg-secondary" />
              <p className="text-[10px] text-muted-foreground mt-1.5">{Math.round(roundProgress)}% of target</p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Summary</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Total Raised</span>
              <span className="text-xs font-medium text-foreground">{formatCurrency(totalRaised)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Investors</span>
              <span className="text-xs font-medium text-foreground">{confirmedBackers.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Remaining</span>
              <span className="text-xs font-medium text-foreground">{formatCurrency(Math.max(targetRaise - totalRaised, 0))}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
