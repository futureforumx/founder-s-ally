import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer group inline-flex h-[22px] w-[42px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 data-[state=checked]:bg-primary/50 data-[state=unchecked]:bg-muted-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-[18px] w-[18px] rounded-full shadow-md ring-0 transition-all duration-200 data-[state=checked]:translate-x-[20px] data-[state=unchecked]:translate-x-0 data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted-foreground/70 data-[state=checked]:shadow-lg",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
