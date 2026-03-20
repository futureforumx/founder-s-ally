import { Globe, Linkedin, Twitter } from "lucide-react";

const SOCIALS = [
  { icon: Globe, label: "Web", hoverClass: "hover:border-accent/40 hover:text-accent hover:shadow-[0_0_12px_-3px_hsl(var(--accent)/0.3)]" },
  { icon: Linkedin, label: "LinkedIn", hoverClass: "hover:border-[#0A66C2]/40 hover:text-[#0A66C2] hover:shadow-[0_0_12px_-3px_rgba(10,102,194,0.3)]" },
  { icon: Twitter, label: "X", hoverClass: "hover:border-foreground/40 hover:text-foreground hover:shadow-[0_0_12px_-3px_hsl(var(--foreground)/0.2)]" },
] as const;

export function SocialIcons() {
  return (
    <div>
      <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Links</h4>
      <div className="flex gap-2">
        {SOCIALS.map(({ icon: Icon, label, hoverClass }) => (
          <button
            key={label}
            title={label}
            className={`inline-flex items-center justify-center h-9 w-9 rounded-xl border border-border bg-card text-muted-foreground transition-all duration-200 hover:scale-105 ${hoverClass}`}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}
