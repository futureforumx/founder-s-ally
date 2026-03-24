import { Shield, Eye, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const ITEMS = [
  {
    icon: Shield,
    title: "Enterprise-Grade Encryption",
    desc: "All data is encrypted at rest (AES-256) and in transit (TLS 1.3). Your credentials are never stored — we use secure OAuth tokens with automatic expiry.",
  },
  {
    icon: Eye,
    title: "AI Transparency",
    desc: "Synced data is used exclusively to analyze connections for intro paths, verify traction metrics, and surface relevant investor matches. We never sell or share your data.",
  },
  {
    icon: Trash2,
    title: "You Own Your Data",
    desc: "Disconnect any integration instantly from Settings. Request a full data export or permanent deletion at any time — no questions asked.",
  },
];

interface PrivacyHubModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrivacyHubModal({ open, onOpenChange }: PrivacyHubModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-[#0A0A0A] border-white/[0.08] text-white p-0 gap-0">
        <DialogHeader className="p-5 pb-3">
          <DialogTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <Shield className="h-4 w-4 text-indigo-400" />
            Privacy &amp; AI Governance
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-2 space-y-3">
          {ITEMS.map((item) => (
            <div
              key={item.title}
              className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3.5 flex gap-3"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                <item.icon className="h-3.5 w-3.5 text-indigo-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-white/90">{item.title}</p>
                <p className="text-[10px] text-white/40 leading-relaxed mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-5 pt-3">
          <Button
            size="sm"
            onClick={() => onOpenChange(false)}
            className="w-full rounded-lg bg-indigo-500 text-white hover:bg-indigo-400 text-xs font-semibold"
          >
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
