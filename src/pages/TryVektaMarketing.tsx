import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { applyTheme, readStoredTheme, toggleTheme, type AppTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** tryvekta.com brand tokens (explicit hex/rgb so nav never inherits invisible tokens). */
const BRAND_PURPLE = "#5b5cff";
const BRAND_GREEN = "rgb(46, 230, 166)";

const NAV_LINKS = [
  { label: "Founders", href: "#founders" },
  { label: "Features", href: "#features" },
  { label: "Benefits", href: "#benefits" },
  { label: "Integrations", href: "#integrations" },
  { label: "Data", href: "#data" },
  { label: "Network", href: "#network" },
  { label: "Insights", href: "#insights" },
] as const;

const FEATURE_PILLS = [
  "Investor matching",
  "Warm intros mapping",
  "Fundraising automation",
  "Competitor tracking",
  "BizOp optimization",
] as const;

function ThemeToggleButton() {
  const [theme, setTheme] = useState<AppTheme>(() => readStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const handleClick = () => {
    const next = toggleTheme(theme);
    applyTheme(next);
    setTheme(next);
  };

  const Icon = theme === "dark" ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-[#eeeeee] transition-colors hover:bg-white/[0.1]"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </button>
  );
}

export default function TryVektaMarketing() {
  useEffect(() => {
    const prev = document.title;
    document.title = "Vekta — AI operating system for founders";
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div className="min-h-screen bg-black font-spaceGrotesk text-[#eeeeee] antialiased">
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="text-lg font-bold tracking-tight text-[#fafafa] outline-none ring-offset-black focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2"
          >
            vekta
          </Link>

          <nav
            className="hidden flex-1 justify-center md:flex"
            aria-label="Primary"
          >
            <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 lg:gap-x-8">
              {NAV_LINKS.map(({ label, href }) => (
                <li key={href}>
                  <a
                    href={href}
                    className={cn(
                      "text-[13px] font-medium text-[#eeeeee] underline-offset-4 transition-colors",
                      "hover:text-white hover:underline",
                    )}
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              to="/login"
              className="hidden text-[13px] font-medium text-[#eeeeee] underline-offset-4 transition-colors hover:text-white hover:underline sm:inline"
            >
              Log in
            </Link>
            <Link
              to="/access"
              className="inline-flex items-center justify-center rounded-full px-4 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: BRAND_PURPLE }}
            >
              Get early access
            </Link>
            <ThemeToggleButton />
          </div>
        </div>

        <div className="border-t border-white/[0.04] px-4 pb-3 pt-2 md:hidden">
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {NAV_LINKS.map(({ label, href }) => (
              <li key={href}>
                <a href={href} className="text-[12px] font-medium text-[#eeeeee] hover:text-white">
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <Link to="/login" className="mt-2 inline-block text-[12px] font-medium text-[#eeeeee] hover:text-white">
            Log in
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
          <p
            className="mb-4 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: BRAND_GREEN }}
          >
            <span className="h-3 w-1 rounded-sm" style={{ backgroundColor: BRAND_GREEN }} aria-hidden />
            About
          </p>
          <h1 className="max-w-4xl text-balance text-3xl font-semibold leading-[1.15] tracking-tight text-[#fafafa] sm:text-4xl lg:text-5xl">
            The AI operating system for founder{" "}
            <span style={{ color: BRAND_PURPLE }}>decision-making.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-[#c4c4c4] sm:text-lg">
            Vekta connects your internal data with real-time market intelligence —so you can see what&apos;s happening,
            understand what matters, and know exactly what to do next.
          </p>

          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 border-y border-white/[0.06] py-6">
            {FEATURE_PILLS.map((label) => (
              <span
                key={label}
                className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#eeeeee]"
              >
                <span className="h-1 w-1 rounded-full bg-[#eeeeee]" aria-hidden />
                {label}
              </span>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              to="/access"
              className="inline-flex items-center justify-center rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: BRAND_PURPLE }}
            >
              Get early access
            </Link>
            <a
              href="https://tryvekta.com/aurora"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: BRAND_GREEN, color: "#050505" }}
            >
              For agents
            </a>
          </div>
        </section>

        {(["founders", "features", "benefits", "integrations", "data", "network", "insights"] as const).map((id) => (
          <section key={id} id={id} className="scroll-mt-24 border-t border-white/[0.06] bg-black py-16">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <h2 className="text-lg font-semibold capitalize text-[#fafafa]">{id}</h2>
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
