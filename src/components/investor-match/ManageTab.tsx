import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, Plus, Search, Settings2, DollarSign, UserPlus, Loader2, ChevronDown, SlidersHorizontal, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { formatCompactCurrency } from "./InlineAmountInput";
import { type CapBacker } from "./CapTableRow";
import { InvestorEditSheet } from "./InvestorEditSheet";
import type { EnrichResult } from "@/hooks/useInvestorEnrich";

// ── Main Export ──

export function ManageTab({ confirmedBackers, totalRaised, formatCurrency, enrichCache }: ManageTabProps) {
  return (
    <CapTablePanel confirmedBackers={confirmedBackers} formatCurrency={formatCurrency} enrichCache={enrichCache} />
  );
}
