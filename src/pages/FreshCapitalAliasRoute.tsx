import { lazy, Suspense } from "react";
import { useParams } from "react-router-dom";
import { BouncingDots } from "@/components/loading-ui/bouncing-dots";
import { useFreshCapitalPublicDestination } from "@/hooks/useFreshCapitalPublicDestination";
import {
  isReservedAppPathSlug,
  normalizePublicPathSlug,
} from "@/lib/freshCapitalPublicPaths";

const FreshCapitalPage = lazy(() => import("./FreshCapitalPage.tsx"));
const NotFound = lazy(() => import("./NotFound.tsx"));

function RouteLoader() {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border border-border/60 bg-card/70 text-muted-foreground">
      <BouncingDots />
      <span className="text-sm">Loading…</span>
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
