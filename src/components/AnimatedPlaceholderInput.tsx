import { forwardRef, useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { useAnimatedPlaceholder, type UseAnimatedPlaceholderOptions } from "@/hooks/useAnimatedPlaceholder";

export type AnimatedPlaceholderInputProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "children"
> & {
  phrases: string[];
  value: string;
  /** Shown when focused (or when animated overlay is hidden) and the field is empty */
  staticPlaceholder?: string;
  animationOptions?: UseAnimatedPlaceholderOptions;
};

function assignRef<T>(node: T | null, ref: React.Ref<T> | null | undefined) {
  if (ref == null) return;
  if (typeof ref === "function") {
    ref(node);
  } else {
    (ref as React.MutableRefObject<T | null>).current = node;
  }
}

export const AnimatedPlaceholderInput = forwardRef<HTMLTextAreaElement, AnimatedPlaceholderInputProps>(
  function AnimatedPlaceholderInput(
    {
      phrases,
      value,
      className,
      staticPlaceholder = "Ask VEX anything…",
      animationOptions,
      onFocus,
      onBlur,
      placeholder,
      ...rest
    },
    ref,
  ) {
    const [focused, setFocused] = useState(false);
    const empty = value.trim() === "";
    const showAnimatedOverlay = empty && !focused;

    const animatedText = useAnimatedPlaceholder(phrases, showAnimatedOverlay, animationOptions);

    const handleFocus = useCallback(
      (e: React.FocusEvent<HTMLTextAreaElement>) => {
        setFocused(true);
        onFocus?.(e);
      },
      [onFocus],
    );

    const handleBlur = useCallback(
      (e: React.FocusEvent<HTMLTextAreaElement>) => {
        setFocused(false);
        onBlur?.(e);
      },
      [onBlur],
    );

    const mergedRef = useCallback(
      (node: HTMLTextAreaElement | null) => {
        assignRef(node, ref);
      },
      [ref],
    );

    return (
      <div className="relative">
        {showAnimatedOverlay ? (
          <div
            className={cn(
              "pointer-events-none absolute inset-0 z-0 flex max-h-48 flex-wrap content-start items-start gap-0 px-4 pt-4 pb-12 pr-10",
              "text-sm leading-normal text-muted-foreground/60",
            )}
            aria-hidden
          >
            <span className="min-w-0 whitespace-pre-wrap break-words">{animatedText}</span>
            <span
              className="placeholder-input-caret ml-px inline-block h-[1.125rem] w-px shrink-0 translate-y-[1px] bg-muted-foreground/55"
              aria-hidden
            />
          </div>
        ) : null}
        <textarea
          {...rest}
          ref={mergedRef}
          value={value}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={
            showAnimatedOverlay ? "" : empty && focused ? staticPlaceholder : (placeholder ?? "")
          }
          className={cn("relative z-[1] block w-full bg-transparent", className)}
        />
      </div>
    );
  },
);
