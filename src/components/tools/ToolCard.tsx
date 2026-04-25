import { ArrowRight, ArrowUpRight, Flame } from "lucide-react";
import { Link } from "react-router-dom";
import type { Tool } from "@/features/tools/types";

export function ToolCard({ tool }: { tool: Tool }) {
  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] transition-all duration-200 hover:-translate-y-1 hover:border-white/[0.16] hover:bg-white/[0.07] hover:shadow-[0_8px_32px_rgba(91,92,255,0.15)]">
      <div className="flex flex-1 flex-col p-5">
        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center rounded-full border border-[#5B5CFF]/30 bg-[#5B5CFF]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#8788FF]">
            {tool.category}
          </span>
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-white/40">
            {tool.subcategory}
          </span>
          {tool.featured ? (
            <span className="inline-flex items-center rounded-full bg-[#5B5CFF] px-2.5 py-0.5 text-[11px] font-semibold text-white">
              Featured
            </span>
          ) : null}
          {tool.trending ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-orange-400">
              <Flame className="h-2.5 w-2.5" />Trending
            </span>
          ) : null}
        </div>

        {/* Title */}
        <div className="mt-3.5 flex items-start justify-between gap-2">
          <Link
            to={`/tools/${tool.slug}`}
            className="font-manrope text-[1.05rem] font-bold leading-snug text-white transition-colors hover:text-[#8788FF]"
          >
            {tool.name}
          </Link>
          <ArrowUpRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-white/20 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#5B5CFF]/70" />
        </div>

        {/* Description — 2 lines max */}
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-white/50">
          {tool.shortDescription}
        </p>

        {/* Pricing */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-0.5 text-[11px] font-medium text-white/40">
            {tool.pricing}
          </span>
          {tool.openSource ? (
            <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
              Open source
            </span>
          ) : null}
        </div>

        {/* Best for */}
        {tool.bestFor.length > 0 ? (
          <p className="mt-auto pt-4 text-xs text-white/25">
            {tool.bestFor.slice(0, 2).join(" · ")}
          </p>
        ) : null}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-white/[0.06] bg-white/[0.02] px-5 py-3">
        <Link
          to={`/tools/${tool.slug}`}
          className="flex items-center gap-1.5 font-manrope text-sm font-bold text-[#5B5CFF] transition-all duration-150 hover:gap-2.5 hover:text-[#8788FF]"
        >
          Use tool
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-1" />
        </Link>
        {tool.websiteUrl ? (
          <a
            href={tool.websiteUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs font-medium text-white/25 transition-colors hover:text-white/60"
          >
            Website ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}
