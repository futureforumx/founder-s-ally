import { ArrowUpRight, BookOpen, Rocket, TrendingUp, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

type Accent = {
  icon: string;
  border: string;
  glow: string;
};

type Resource = {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
  accent: Accent;
};

const RESOURCES: Resource[] = [
  {
    Icon: Zap,
    title: "AI Skills Library",
    description: "Explore capabilities like browsing, code execution, and automation",
    href: "/tools/ai-skills",
    accent: {
      icon: "bg-emerald-500/10 text-emerald-400",
      border: "hover:border-emerald-500/25",
      glow: "hover:shadow-[0_4px_20px_rgba(16,185,129,0.08)]",
    },
  },
  {
    Icon: TrendingUp,
    title: "Recent Funding",
    description: "Track newly funded startups and active investors",
    href: "/fresh-capital",
    accent: {
      icon: "bg-sky-500/10 text-sky-400",
      border: "hover:border-sky-500/25",
      glow: "hover:shadow-[0_4px_20px_rgba(14,165,233,0.08)]",
    },
  },
  {
    Icon: Rocket,
    title: "Accelerators",
    description: "Browse top startup accelerators and programs",
    href: "/accelerators",
    accent: {
      icon: "bg-violet-500/10 text-violet-400",
      border: "hover:border-violet-500/25",
      glow: "hover:shadow-[0_4px_20px_rgba(139,92,246,0.08)]",
    },
  },
  {
    Icon: BookOpen,
    title: "Guides",
    description: "Learn fundraising, GTM, and startup strategy",
    href: "/guides",
    accent: {
      icon: "bg-zinc-700/70 text-zinc-400",
      border: "hover:border-zinc-600/50",
      glow: "hover:shadow-[0_4px_20px_rgba(161,161,170,0.06)]",
    },
  },
];

function ResourceCard({ resource }: { resource: Resource }) {
  const { Icon, title, description, href, accent } = resource;
  return (
    <a
      href={href}
      className={cn(
        "group flex flex-col gap-4 rounded-2xl border border-zinc-800/70 bg-zinc-900/35 p-5 transition-all duration-150",
        "-translate-y-0 hover:-translate-y-0.5",
        accent.border,
        accent.glow,
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", accent.icon)}>
          <Icon className="h-[1.05rem] w-[1.05rem]" />
        </div>
        <ArrowUpRight className="h-4 w-4 text-zinc-600 transition-all duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-zinc-400" />
      </div>
      <div>
        <p className="font-manrope text-sm font-semibold text-zinc-100">{title}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
      </div>
    </a>
  );
}

export function ExploreResources() {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-manrope text-2xl font-semibold tracking-tight text-zinc-100">Explore resources</h2>
        <p className="mt-1.5 max-w-xl text-sm text-zinc-400">
          Go beyond tools — discover data, insights, and workflows for building your startup.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {RESOURCES.map((resource) => (
          <ResourceCard key={resource.title} resource={resource} />
        ))}
      </div>
    </section>
  );
}
