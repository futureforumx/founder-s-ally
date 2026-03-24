import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { Sparkles, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SocialPlatformType = "linkedin" | "x";

interface PlatformConfig {
  prefix: string;
  placeholder: string;
  faviconUrl: string;
  brandColor: string;
  domain: RegExp;
}

const PLATFORM_CONFIG: Record<SocialPlatformType, PlatformConfig> = {
  linkedin: {
    prefix: "linkedin.com/in/",
    placeholder: "@username",
    faviconUrl: "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://linkedin.com&size=32",
    brandColor: "#0A66C2",
    domain: /linkedin\.com/i,
  },
  x: {
    prefix: "x.com/",
    placeholder: "@handle",
    faviconUrl: "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://x.com&size=32",
    brandColor: "#000000",
    domain: /(?:x\.com|twitter\.com)/i,
  },
};

function extractHandle(value: string, platform: SocialPlatformType): { isFullUrl: boolean; handle: string } {
  const trimmed = value.trim();
  if (!trimmed) return { isFullUrl: false, handle: "" };

  // Full URL pasted
  if (/^https?:\/\//i.test(trimmed)) {
    return { isFullUrl: true, handle: trimmed };
  }

  // Contains domain path like "linkedin.com/in/name"
  const config = PLATFORM_CONFIG[platform];
  if (config.domain.test(trimmed)) {
    return { isFullUrl: true, handle: trimmed.startsWith("http") ? trimmed : `https://${trimmed}` };
  }

  // Bare handle — strip @
  const handle = trimmed.replace(/^@/, "").replace(/\/+$/, "");
  return { isFullUrl: false, handle };
}

interface MorphingUrlInputProps {
  platform: SocialPlatformType;
  value: string;
  onChange: (value: string) => void;
  onBlur?: (formattedValue: string) => void;
  /** "idle" | "syncing" | "verified" */
  verifyState?: "idle" | "syncing" | "verified";
  onVerify?: () => void;
  verifyLabel?: string;
  className?: string;
  label?: string;
}

export function MorphingUrlInput({
  platform,
  value,
  onChange,
  onBlur,
  verifyState = "idle",
  onVerify,
  verifyLabel = "Verify",
  className,
  label,
}: MorphingUrlInputProps) {
  const config = PLATFORM_CONFIG[platform];
  const inputRef = useRef<HTMLInputElement>(null);
  const prefixRef = useRef<HTMLSpanElement>(null);
  const [focused, setFocused] = useState(false);
  const [prefixWidth, setPrefixWidth] = useState(0);

  const { isFullUrl, handle } = extractHandle(value, platform);
  const hasValue = handle.length > 0;
  const showPrefix = hasValue && !isFullUrl;

  // Measure prefix width for padding
  useEffect(() => {
    if (prefixRef.current && showPrefix) {
      setPrefixWidth(prefixRef.current.offsetWidth);
    } else {
      setPrefixWidth(0);
    }
  }, [showPrefix, handle]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.toLowerCase();
    onChange(raw);
  }, [onChange]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    if (onBlur) {
      onBlur(value);
    }
  }, [onBlur, value]);

  return (
    <div className={cn("space-y-1", className)}>
      {label && (
        <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {label}
        </label>
      )}
      <div className="relative group">
        {/* Favicon */}
        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 z-10">
          <motion.div
            animate={{
              scale: hasValue ? 1 : 0.85,
              opacity: hasValue ? 1 : 0.4,
            }}
            transition={{ duration: 0.2 }}
          >
            <img
              src={config.faviconUrl}
              alt=""
              className={cn(
                "h-4 w-4 rounded-sm transition-all duration-300",
                hasValue ? "grayscale-0 opacity-100" : "grayscale opacity-40"
              )}
              style={hasValue ? { filter: "none" } : undefined}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </motion.div>
        </div>

        {/* Animated prefix */}
        <AnimatePresence>
          {showPrefix && (
            <motion.span
              ref={prefixRef}
              initial={{ opacity: 0, x: -8, width: 0 }}
              animate={{ opacity: 1, x: 0, width: "auto" }}
              exit={{ opacity: 0, x: -8, width: 0 }}
              transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="absolute left-9 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/60 font-mono pointer-events-none whitespace-nowrap z-10 select-none"
            >
              {config.prefix}
            </motion.span>
          )}
        </AnimatePresence>

        {/* Input */}
        <input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          placeholder={focused ? config.placeholder : `${config.prefix}${config.placeholder}`}
          className={cn(
            "flex w-full rounded-lg border bg-background py-1.5 text-sm h-9 ring-offset-background transition-all duration-200",
            "placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "pl-9 pr-20",
            focused && "border-accent/40",
          )}
          style={{
            paddingLeft: showPrefix ? `${36 + prefixWidth}px` : "36px",
            transition: "padding-left 0.25s ease",
          }}
        />

        {/* Right action area */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <AnimatePresence mode="wait">
            {verifyState === "syncing" && (
              <motion.span
                key="syncing"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-1 text-[10px] text-accent"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="hidden sm:inline">Connecting…</span>
              </motion.span>
            )}

            {verifyState === "verified" && (
              <motion.span
                key="verified"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-0.5 text-[10px] font-medium"
                style={{ color: "hsl(var(--success, 142 76% 36%))" }}
              >
                <motion.div
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 1.2, repeat: 1, ease: "easeInOut" }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </motion.div>
                <span className="hidden sm:inline">Verified</span>
              </motion.span>
            )}

            {verifyState === "idle" && hasValue && onVerify && (
              <motion.button
                key="verify"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={(e) => { e.stopPropagation(); onVerify(); }}
                className="text-[10px] font-medium text-accent hover:text-accent/80 transition-colors flex items-center gap-0.5"
              >
                <Sparkles className="h-3 w-3" />
                {verifyLabel}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
