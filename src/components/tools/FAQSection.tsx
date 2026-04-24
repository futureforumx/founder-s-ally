import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { ToolFaqItem } from "@/features/tools/types";

export function FAQSection({
  title = "Frequently asked questions",
  items,
}: {
  title?: string;
  items: ToolFaqItem[];
}) {
  return (
    <section className="rounded-[1.75rem] border border-zinc-800 bg-[#060709] p-6 shadow-sm">
      <h2 className="font-clash text-2xl font-semibold tracking-tight text-zinc-100">{title}</h2>
      <Accordion type="single" collapsible className="mt-4">
        {items.map((item, index) => (
          <AccordionItem key={item.question} value={`faq-${index}`}>
            <AccordionTrigger className="text-left text-sm font-medium">{item.question}</AccordionTrigger>
            <AccordionContent className="text-sm leading-7 text-zinc-400">{item.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
