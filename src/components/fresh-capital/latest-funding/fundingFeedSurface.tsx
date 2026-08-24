import { createContext, useContext, type ReactNode } from "react";

export type FundingFeedSurface = "app" | "public";

const FundingFeedSurfaceContext = createContext<FundingFeedSurface>("public");

export function FundingFeedSurfaceProvider({
  surface,
  children,
}: {
  surface: FundingFeedSurface;
  children: ReactNode;
}) {
  return <FundingFeedSurfaceContext.Provider value={surface}>{children}</FundingFeedSurfaceContext.Provider>;
}

export function useFundingFeedApp(): boolean {
  return useContext(FundingFeedSurfaceContext) === "app";
}
