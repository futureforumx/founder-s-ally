import { lazy, Suspense } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useFreshCapitalPublicDestination } from "@/hooks/useFreshCapitalPublicDestination";
import {
  isReservedAppPathSlug,
  normalizePublicPathSlug,
} from "@/lib/freshCapitalPublicPaths";

const FreshCapitalPage = lazy(() => import("./FreshCapitalPage.tsx"));
const NotFound = lazy(() => import("./NotFound.tsx"));

function RouteLoader() {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-border/60 bg-card/70 text-muted-foreground">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin text-accent" />
        <span>Loading…</span>
      </div>
    </div>
  );
}

export default function FreshCapitalAliasRoute() {
  const { publicSlug } = useParams();
  const slug = normalizePublicPathSlug(publicSlug ?? "") ?? "";
  const reserved = !slug || isReservedAppPathSlug(slug);
  const { data, isPending } = useFreshCapitalPublicDestination(reserved ? null : slug);

  if (reserved) {
    return (
      <Suspense fallback={<RouteLoader />}>
        <NotFound />
      </Suspense>
    );
  }
  if (isPending) return <RouteLoader />;
  if (!data) {
    return (
      <Suspense fallback={<RouteLoader />}>
        <NotFound />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<RouteLoader />}>
      <FreshCapitalPage />
    </Suspense>
  );
}
