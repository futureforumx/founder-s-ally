import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trackFreshCapitalJoinVekta } from "@/lib/freshCapitalAnalytics";

const REGISTER_HREF = "https://vekta.so/register";

type RegisterModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RegisterModal({ open, onOpenChange }: RegisterModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-800 bg-zinc-950 p-6 font-spaceGrotesk text-zinc-100 sm:max-w-sm">
        <DialogHeader className="space-y-2 pr-6 text-left">
          <DialogTitle className="text-lg font-semibold leading-snug tracking-tight text-white">
            Ready to join the ultimate founder funding platform?
          </DialogTitle>
          <DialogDescription className="sr-only">
            Continue to vekta.so/register to request access.
          </DialogDescription>
        </DialogHeader>
        <Button asChild className="w-full rounded-full">
          <a
            href={REGISTER_HREF}
            onClick={() => {
              trackFreshCapitalJoinVekta({ cta_location: "fund_watch_unlock_popover" });
              onOpenChange(false);
            }}
          >
            Request access
          </a>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
