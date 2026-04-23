import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        // Default - Primary
        default: "h-6 px-2.5 rounded-lg border border-primary/30 bg-primary/8 text-primary hover:bg-primary/12",
        
        // Secondary
        secondary: "h-6 px-2.5 rounded-lg border border-secondary/40 bg-secondary/10 text-secondary-foreground hover:bg-secondary/15",
        
        // Semantic - Success
        success: "h-6 px-2.5 rounded-lg border border-success/35 bg-success/10 text-success-foreground hover:bg-success/15",
        
        // Semantic - Warning
        warning: "h-6 px-2.5 rounded-lg border border-warning/40 bg-warning/10 text-warning hover:bg-warning/15",
        
        // Semantic - Destructive
        destructive: "h-6 px-2.5 rounded-lg border border-destructive/35 bg-destructive/10 text-destructive hover:bg-destructive/15",
        
        // Semantic - Accent
        accent: "h-6 px-2.5 rounded-lg border border-accent/35 bg-accent/10 text-accent hover:bg-accent/15",
        
        // Semantic - Muted
        muted: "h-6 px-2.5 rounded-lg border border-muted-foreground/25 bg-muted/60 text-muted-foreground hover:bg-muted/80",
        
        // Outline - Borderless
        outline: "h-6 px-2.5 rounded-lg border border-border/50 bg-background text-foreground hover:bg-muted/30",
        
        // Compact variants (20px height)
        "default-sm": "h-5 px-2 rounded-lg border border-primary/30 bg-primary/8 text-primary text-[11px] hover:bg-primary/12",
        "secondary-sm": "h-5 px-2 rounded-lg border border-secondary/40 bg-secondary/10 text-secondary-foreground text-[11px] hover:bg-secondary/15",
        "success-sm": "h-5 px-2 rounded-lg border border-success/35 bg-success/10 text-success-foreground text-[11px] hover:bg-success/15",
        "warning-sm": "h-5 px-2 rounded-lg border border-warning/40 bg-warning/10 text-warning text-[11px] hover:bg-warning/15",
        "destructive-sm": "h-5 px-2 rounded-lg border border-destructive/35 bg-destructive/10 text-destructive text-[11px] hover:bg-destructive/15",
        "accent-sm": "h-5 px-2 rounded-lg border border-accent/35 bg-accent/10 text-accent text-[11px] hover:bg-accent/15",
        "muted-sm": "h-5 px-2 rounded-lg border border-muted-foreground/25 bg-muted/60 text-muted-foreground text-[11px] hover:bg-muted/80",
        "outline-sm": "h-5 px-2 rounded-lg border border-border/50 bg-background text-foreground text-[11px] hover:bg-muted/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(({ className, variant, ...props }, ref) => {
  return <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />;
});

Badge.displayName = "Badge";

export { Badge };
