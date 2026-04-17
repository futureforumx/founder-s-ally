import type { NetworkReadinessAction, ReachablePerson } from "./types";

export function deriveReadiness(person: ReachablePerson): {
  action: NetworkReadinessAction;
  rationale: string;
} {
  const conf = person.bestPath.confidence ?? 0;
  const score = person.bestPath.score;
  if (person.hop === "3-hop" || score < 62 || conf < 0.62) {
    return {
      action: "find_connector",
      rationale: "Path is long or thin — a closer intermediary will improve odds.",
    };
  }
  if (person.hop === "2-hop" && (score < 84 || conf < 0.78)) {
    return {
      action: "strengthen_relationship",
      rationale: "Intermediary is warm but not maximally activated — invest before the ask.",
    };
  }
  return {
    action: "request_intro",
    rationale: "Trust and fit cross the bar you use for outbound intros.",
  };
}

export function readinessCtaLabel(action: NetworkReadinessAction): string {
  switch (action) {
    case "request_intro":
      return "Request intro";
    case "strengthen_relationship":
      return "Strengthen relationship";
    case "find_connector":
      return "Find connector";
    default:
      return "Next step";
  }
}
