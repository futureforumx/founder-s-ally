import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function StarRating({
  rating,
  className,
}: {
  rating: number | null;
  className?: string;
}) {
  if (rating == null) {
    return <div className={cn("text-xs text-muted-foreground", className)}>Rating not publicly listed</div>;
  }

  const wholeStars = Math.round(rating);
  return (
    <div className={cn("inline-flex items-center gap-2 text-xs text-muted-foreground", className)}>
      <div className="flex items-center gap-0.5 text-amber-500">
        {Array.from({ length: 5 }).map((_, index) => (
          <Star key={index} className={cn("h-3.5 w-3.5", index < wholeStars ? "fill-current" : "")} />
        ))}
      </div>
      <span>{rating.toFixed(1)}</span>
    </div>
  );
}
