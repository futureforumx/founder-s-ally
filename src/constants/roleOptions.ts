import type { ComboboxOption } from "@/components/ui/smart-combobox";

export const ROLE_OPTIONS: ComboboxOption[] = [
  { value: "CEO & Founder", label: "CEO & Founder", desc: "Chief Executive Officer" },
  { value: "CEO & Co-Founder", label: "CEO & Co-Founder", desc: "Co-founded the company" },
  { value: "CTO & Co-Founder", label: "CTO & Co-Founder", desc: "Technical co-founder" },
  { value: "CTO", label: "CTO", desc: "Chief Technology Officer" },
  { value: "COO", label: "COO", desc: "Chief Operating Officer" },
  { value: "CPO", label: "CPO", desc: "Chief Product Officer" },
  { value: "Head of Product", label: "Head of Product", desc: "Product leadership" },
  { value: "Head of Engineering", label: "Head of Engineering", desc: "Engineering leadership" },
  { value: "Solo Founder", label: "Solo Founder", desc: "Single founder" },
  { value: "Managing Partner", label: "Managing Partner", desc: "Fund or firm partner" },
  { value: "General Partner", label: "General Partner", desc: "GP at a fund" },
  { value: "VP of Engineering", label: "VP of Engineering", desc: "Engineering executive" },
  { value: "VP of Operations", label: "VP of Operations", desc: "Operations executive" },
];
