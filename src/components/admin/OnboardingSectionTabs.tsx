type OnboardingSection = "edit" | "analytics";

const SECTIONS: { id: OnboardingSection; label: string }[] = [
  { id: "edit", label: "Edit" },
  { id: "analytics", label: "Analytics" },
];

export function OnboardingSectionTabs({
  section,
  onChange,
}: {
  section: OnboardingSection;
  onChange: (next: OnboardingSection) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Onboarding sections">
      {SECTIONS.map((item) => {
        const selected = section === item.id;

        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.id)}
            className={`inline-flex h-8 items-center rounded-md border px-3 font-sans text-sm transition-colors ${
              selected
                ? "border-neutral-700 bg-neutral-900 text-neutral-100"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export type { OnboardingSection };
