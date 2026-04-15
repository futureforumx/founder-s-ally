import { Globe, Linkedin, Twitter } from "lucide-react";

function trimUrl(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function withHttps(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

export interface SocialIconsProps {
  websiteUrl?: string | null;
  linkedinUrl?: string | null;
  twitterUrl?: string | null;
  /** When false, omit the section title (e.g. compact header row). */
  showHeading?: boolean;
  /** Smaller hit targets for the modal header. */
  compact?: boolean;
}

export function SocialIcons({
  websiteUrl,
  linkedinUrl,
  twitterUrl,
  showHeading = true,
  compact = false,
}: SocialIconsProps) {
  const web = trimUrl(websiteUrl);
  const li = trimUrl(linkedinUrl);
  const tw = trimUrl(twitterUrl);
  const hrefWeb = web ? withHttps(web) : null;
  const hrefLi = li ? withHttps(li) : null;
  const hrefTw = tw ? withHttps(tw) : null;

  const items: { key: string; href: string; icon: typeof Globe; label: string; hoverClass: string }[] = [];
  if (hrefWeb) {
    items.push({
      key: "web",
      href: hrefWeb,
      icon: Globe,
      label: "Website",
      hoverClass: "hover:border-accent/40 hover:text-accent hover:shadow-[0_0_12px_-3px_hsl(var(--accent)/0.3)]",
    });
  }
  if (hrefLi) {
    items.push({
      key: "linkedin",
      href: hrefLi,
      icon: Linkedin,
      label: "LinkedIn",
      hoverClass: "hover:border-[#0A66C2]/40 hover:text-[#0A66C2] hover:shadow-[0_0_12px_-3px_rgba(10,102,194,0.3)]",
    });
  }
  if (hrefTw) {
    items.push({
      key: "x",
      href: hrefTw,
      icon: Twitter,
      label: "X / Twitter",
      hoverClass: "hover:border-foreground/40 hover:text-foreground hover:shadow-[0_0_12px_-3px_hsl(var(--foreground)/0.2)]",
    });
  }

  if (items.length === 0) return null;

  const btn = compact ? "h-8 w-8 rounded-lg" : "h-9 w-9 rounded-xl";
  const iconSz = compact ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <div>
      {showHeading ? (
        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Links</h4>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {items.map(({ key, href, icon: Icon, label, hoverClass }) => (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={label}
            aria-label={label}
            className={`inline-flex items-center justify-center ${btn} border border-border bg-card text-muted-foreground transition-all duration-200 hover:scale-105 ${hoverClass}`}
          >
            <Icon className={iconSz} />
          </a>
        ))}
      </div>
    </div>
  );
}
