import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { isValidSubscribeEmail, submitLoopsNewsletterForm } from "@/lib/loopsNewsletterForm";

type SubscribeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SubscribeModal({ open, onOpenChange }: SubscribeModalProps) {
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setEmailError(null);
    setSubmitError(null);
    setSubmitting(false);
    setSubmitted(false);
  }, [open]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextEmail = email.trim();
    if (!nextEmail) {
      setEmailError("Email is required.");
      emailRef.current?.focus();
      return;
    }
    if (!isValidSubscribeEmail(nextEmail)) {
      setEmailError("Enter a valid email.");
      emailRef.current?.focus();
      return;
    }

    setEmailError(null);
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await submitLoopsNewsletterForm(nextEmail);
      if (result.ok === false) {
        setSubmitted(false);
        setSubmitError(result.message);
        toast({ variant: "destructive", title: "Couldn't subscribe", description: result.message });
        return;
      }
      setEmailError(null);
      setSubmitError(null);
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="border-zinc-700 bg-[#0a0a0a] font-spaceGrotesk text-[#eeeeee] sm:max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          emailRef.current?.focus();
        }}
      >
        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="h-10 w-10 text-success" aria-hidden />
            <DialogHeader className="items-center space-y-2">
              <DialogTitle className="text-[#eeeeee]">You're on the list!</DialogTitle>
              <DialogDescription className="text-[#b3b3b3]">
                We'll notify you when new deals drop.
              </DialogDescription>
            </DialogHeader>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-[#eeeeee]">Stay Ahead of the Market</DialogTitle>
              <DialogDescription className="text-[#b3b3b3]">
                Get real-time updates when new funding rounds and fund launches are detected.
              </DialogDescription>
            </DialogHeader>

            <form className="space-y-4" onSubmit={onSubmit} noValidate>
              <div className="space-y-2">
                <Label htmlFor="subscribe-email" className="text-[11px] uppercase tracking-[0.12em] text-[#b3b3b3]">
                  Email
                </Label>
                <Input
                  ref={emailRef}
                  id="subscribe-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  autoFocus
                  inputMode="email"
                  placeholder="you@company.com"
                  value={email}
                  disabled={submitting}
                  aria-invalid={emailError ? true : undefined}
                  aria-describedby={emailError ? "subscribe-email-error" : undefined}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (emailError) setEmailError(null);
                    if (submitError) setSubmitError(null);
                  }}
                  className="border-zinc-700 bg-zinc-950 text-[#eeeeee] placeholder:text-zinc-500"
                />
                {emailError ? (
                  <p id="subscribe-email-error" className="text-xs text-red-400">
                    {emailError}
                  </p>
                ) : null}
              </div>

              {submitError ? (
                <Alert variant="destructive" className="border-red-500/40 bg-red-950/40 text-red-200">
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              ) : null}

              <Button type="submit" disabled={submitting} className="w-full rounded-full">
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Submitting…
                  </span>
                ) : (
                  "Get Notified"
                )}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
