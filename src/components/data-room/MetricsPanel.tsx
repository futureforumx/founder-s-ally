import {
  DeckMetricsConfirmation,
  type DeckMetricsConfirmationProps,
} from "./DeckMetricsConfirmation";

export function MetricsPanel({
  onReupload,
  onSkip,
  onConfirm,
}: DeckMetricsConfirmationProps) {
  return (
    <DeckMetricsConfirmation
      onReupload={onReupload}
      onSkip={onSkip}
      onConfirm={onConfirm}
    />
  );
}

export default MetricsPanel;
