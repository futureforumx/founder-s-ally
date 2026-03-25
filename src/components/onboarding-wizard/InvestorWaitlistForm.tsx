import { useState } from "react";
import { motion } from "framer-motion";
import { Briefcase, ArrowRight, Loader2, CheckCircle2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export function InvestorWaitlistForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [firm, setFirm] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const validate = () => {
    const newErrors: Record<string, boolean> = {};
    if (!firstName.trim()) newErrors.firstName = true;
    if (!lastName.trim()) newErrors.lastName = true;
    if (!firm.trim()) newErrors.firm = true;
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) newErrors.email = true;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("investor-waitlist", {
        body: { firstName: firstName.trim(), lastName: lastName.trim(), firm: firm.trim(), email: email.trim() },
      });
      if (error) throw error;
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Something went wrong", description: "Please try again later." });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4 w-full max-w-lg mx-auto text-center py-8"
      >
        <div className="h-14 w-14 rounded-full bg-accent/10 flex items-center justify-center">
          <CheckCircle2 className="h-7 w-7 text-accent" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">You're on the list!</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          We'll notify you at <span className="font-medium text-foreground">{email}</span> as soon as investor access is available.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-col items-center gap-5 w-full max-w-lg mx-auto"
    >
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-3">
          <Briefcase className="h-5 w-5 text-accent" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Investors are not yet offered
        </h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          Get updated for when we launch. Leave your details below and we'll let you know.
        </p>
      </div>

      {/* Form */}
      <div className="w-full rounded-xl border border-border bg-card p-5 space-y-3.5">
        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              First Name <span className="text-destructive">*</span>
            </label>
            <Input
              value={firstName}
              onChange={(e) => { setFirstName(e.target.value); if (errors.firstName) setErrors(p => ({ ...p, firstName: false })); }}
              placeholder="Jane"
              className={`rounded-lg h-9 text-sm ${errors.firstName ? "border-destructive" : ""}`}
            />
            {errors.firstName && <p className="text-[10px] text-destructive">Required</p>}
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Last Name <span className="text-destructive">*</span>
            </label>
            <Input
              value={lastName}
              onChange={(e) => { setLastName(e.target.value); if (errors.lastName) setErrors(p => ({ ...p, lastName: false })); }}
              placeholder="Doe"
              className={`rounded-lg h-9 text-sm ${errors.lastName ? "border-destructive" : ""}`}
            />
            {errors.lastName && <p className="text-[10px] text-destructive">Required</p>}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Firm <span className="text-destructive">*</span>
          </label>
          <Input
            value={firm}
            onChange={(e) => { setFirm(e.target.value); if (errors.firm) setErrors(p => ({ ...p, firm: false })); }}
            placeholder="e.g. Sequoia Capital"
            className={`rounded-lg h-9 text-sm ${errors.firm ? "border-destructive" : ""}`}
          />
          {errors.firm && <p className="text-[10px] text-destructive">Required</p>}
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Email <span className="text-destructive">*</span>
          </label>
          <Input
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors(p => ({ ...p, email: false })); }}
            placeholder="jane@sequoia.com"
            type="email"
            className={`rounded-lg h-9 text-sm ${errors.email ? "border-destructive" : ""}`}
          />
          {errors.email && <p className="text-[10px] text-destructive">Valid email required</p>}
        </div>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full max-w-lg gap-1.5 h-9 text-xs"
        size="sm"
      >
        {submitting ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" /> Joining waitlist...
          </>
        ) : (
          <>
            <Mail className="h-3 w-3" /> Join the Waitlist <ArrowRight className="h-3 w-3" />
          </>
        )}
      </Button>
    </motion.div>
  );
}
