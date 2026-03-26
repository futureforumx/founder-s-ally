import { useState } from "react";
import { ChevronDown, ExternalLink, Mail, BookOpen, Zap, Users, Home, FileText, Settings, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FAQItem {
  category: string;
  questions: Array<{
    q: string;
    a: string;
  }>;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    category: "Getting Started",
    questions: [
      {
        q: "How do I set up my company profile?",
        a: "Go to Settings > Company to add your company information. Our AI will analyze your company details to generate insights, market positioning, and health metrics. Complete your profile to unlock all features."
      },
      {
        q: "What information do I need to provide?",
        a: "You'll need your company name, website, sector, funding stage, and team size. Additional details like competitors, recent news, and achievements help our AI provide more accurate analysis."
      },
      {
        q: "How long does the analysis take?",
        a: "The initial analysis typically takes 2-5 minutes. You'll see real-time progress as our AI processes your information. Re-analyzing takes similar time and keeps your intelligence updated."
      }
    ]
  },
  {
    category: "Dashboard & Analytics",
    questions: [
      {
        q: "What are the different dashboard sections?",
        a: "Company: Your health metrics and vital signs | Industry: Market trends in your sector | Competitive: How you compare to competitors | Competitors: Battlecards for competitive positioning | Sector: Market insights and trends"
      },
      {
        q: "How is my Company Health calculated?",
        a: "Health is based on multiple factors including market position, team composition, funding metrics, and growth indicators. The score ranges from 0-100 and updates as you complete your profile."
      },
      {
        q: "What are Benchmarks?",
        a: "Benchmarks compare your metrics against industry standards for your stage and sector. This helps you understand if you're ahead or behind peers in key performance areas."
      }
    ]
  },
  {
    category: "Investors & Fundraising",
    questions: [
      {
        q: "How does investor matching work?",
        a: "Our AI analyzes investor fund strategies, check sizes, and sector focus, then matches them with your company profile. Matches are ranked by fit, considering your stage, sector, and growth metrics."
      },
      {
        q: "What information does investors see?",
        a: "Investors see your verified company profile summary, key metrics, and sector positioning. Your profile information is always under your control. Complete verification to boost credibility with investors."
      },
      {
        q: "How do I search for investors?",
        a: "Use the Investors > Search section to filter by focus area, check size, stage preference, and geography. Our AI suggestions help identify investors most likely to be interested in your company."
      }
    ]
  },
  {
    category: "Network & Community",
    questions: [
      {
        q: "How do I manage my connections?",
        a: "The Network section shows your connections, shared investors, and warm introduction paths. Track all your relationships and leverage warm introductions to expand your network strategically."
      },
      {
        q: "What does 'Warm Intro' mean?",
        a: "A warm introduction connects you to an investor through a shared connection. These typically have higher response rates than cold outreach. You can track and manage all warm paths in your Connections."
      },
      {
        q: "Can I view investor feedback on my company?",
        a: "Yes, in Connections > Feedback, you'll see detailed feedback from investors you've spoken with. This helps you understand objections and improve your pitch."
      }
    ]
  },
  {
    category: "Deck & Documents",
    questions: [
      {
        q: "How does Deck Audit work?",
        a: "Upload your pitch deck and our AI analyzes it for clarity, storytelling, data quality, and visual effectiveness. You'll get specific feedback to strengthen your narrative before investor meetings."
      },
      {
        q: "What makes a good pitch deck?",
        a: "Strong decks tell a compelling story (problem-solution), show market validation, include honest metrics, and have professional design. Our audit gives you specific improvement recommendations."
      },
      {
        q: "Can I re-audit my deck?",
        a: "Yes, you can upload an updated deck anytime. Each audit is fresh, so you can track improvements and see the impact of changes you've made."
      }
    ]
  },
  {
    category: "Privacy & Settings",
    questions: [
      {
        q: "How is my data protected?",
        a: "We use enterprise-grade encryption and comply with data protection regulations. Your company profile and analysis results are securely stored and only shared with investors you explicitly authorize."
      },
      {
        q: "Can I control what information is visible?",
        a: "Yes, all visibility settings are in Settings > Privacy. You can adjust what information is shared with the community, investors, and your network."
      },
      {
        q: "How do I delete my account?",
        a: "Go to Settings > Account and select 'Delete Account'. This permanently removes all your data. Download any important information before deletion."
      }
    ]
  }
];

const RESOURCES = [
  {
    icon: BookOpen,
    title: "Documentation",
    description: "Detailed guides and tutorials",
    href: "https://www.builder.io/c/docs/projects"
  },
  {
    icon: Mail,
    title: "Email Support",
    description: "Reach our support team",
    href: "mailto:support@vekta.app"
  },
  {
    icon: Zap,
    title: "Feature Updates",
    description: "See what's new",
    href: "https://www.builder.io/c/docs/projects"
  }
];

export function HelpCenter() {
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const toggleQuestion = (category: string, index: number) => {
    const key = `${category}-${index}`;
    setExpandedItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Help Center</h1>
        <p className="text-base text-muted-foreground">Find answers to common questions and learn how to get the most out of Vekta.</p>
      </div>

      {/* Quick Resources */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {RESOURCES.map((resource) => {
          const Icon = resource.icon;
          return (
            <a
              key={resource.title}
              href={resource.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-xl border border-border/50 bg-card/50 hover:bg-card/80 p-4 transition-all hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-secondary p-2.5">
                  <Icon className="h-5 w-5 text-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground group-hover:text-accent transition-colors">{resource.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{resource.description}</p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors shrink-0 mt-0.5" />
              </div>
            </a>
          );
        })}
      </div>

      <div className="h-px bg-border/30" />

      {/* FAQ Sections */}
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-foreground">Frequently Asked Questions</h2>
        
        {FAQ_ITEMS.map((section) => (
          <div key={section.category} className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wide">{section.category}</h3>
            
            <div className="space-y-2">
              {section.questions.map((item, index) => {
                const key = `${section.category}-${index}`;
                const isExpanded = expandedItems[key];
                
                return (
                  <button
                    key={key}
                    onClick={() => toggleQuestion(section.category, index)}
                    className="w-full text-left group"
                  >
                    <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-card/30 hover:bg-card/50 p-4 transition-all">
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 text-muted-foreground/60 transition-transform shrink-0",
                          isExpanded && "rotate-180"
                        )}
                      />
                      <span className="flex-1 font-medium text-foreground group-hover:text-accent/90 transition-colors">
                        {item.q}
                      </span>
                    </div>
                    
                    {isExpanded && (
                      <div className="mt-2 rounded-lg border border-border/20 bg-muted/20 p-4 text-sm text-muted-foreground leading-relaxed animate-fade-in">
                        {item.a}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Contact Section */}
      <div className="rounded-xl border border-border/50 bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-6 space-y-4">
        <div className="space-y-2">
          <h3 className="font-semibold text-foreground">Still have questions?</h3>
          <p className="text-sm text-muted-foreground">
            Can't find the answer you're looking for? Our support team is here to help.
          </p>
        </div>
        
        <a
          href="mailto:support@vekta.app"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition-colors font-medium text-sm"
        >
          <Mail className="h-4 w-4" />
          Contact Support
        </a>
      </div>
    </div>
  );
}
