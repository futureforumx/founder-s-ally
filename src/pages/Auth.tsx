import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Terminal } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

export default function Auth() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [aiGuessedCompany, setAiGuessedCompany] = useState(false);
  const [aiGuessedWebsite, setAiGuessedWebsite] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) navigate("/", { replace: true });
  }, [user, authLoading, navigate]);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEmail(val);
    
    if (!aiGuessedCompany && companyName.length > 0) return;
    if (!aiGuessedWebsite && websiteUrl.length > 0) return;
    
    const parts = val.split('@');
    if (parts.length === 2 && parts[1].includes('.')) {
      const domain = parts[1];
      const genericDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'me.com', 'mac.com'];
      if (!genericDomains.includes(domain.toLowerCase()) && domain.length > 3) {
        const namePart = domain.split('.')[0];
        const guessedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
        
        if (!companyName || aiGuessedCompany) {
           setCompanyName(guessedName);
           setAiGuessedCompany(true);
        }
        if (!websiteUrl || aiGuessedWebsite) {
           setWebsiteUrl(`https://${domain}`);
           setAiGuessedWebsite(true);
        }
      } else {
        if (aiGuessedCompany) { setCompanyName(""); setAiGuessedCompany(false); }
        if (aiGuessedWebsite) { setWebsiteUrl(""); setAiGuessedWebsite(false); }
      }
    } else {
      if (aiGuessedCompany) { setCompanyName(""); setAiGuessedCompany(false); }
      if (aiGuessedWebsite) { setWebsiteUrl(""); setAiGuessedWebsite(false); }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
              full_name: `${firstName} ${lastName}`.trim()
            }
          }
        });
        if (error) throw error;
        
        if (companyName || websiteUrl) {
          const aiGuessed: string[] = [];
          if (aiGuessedCompany) aiGuessed.push('companyName');
          if (aiGuessedWebsite) aiGuessed.push('websiteUrl');
          localStorage.setItem("pending-company-seed", JSON.stringify({
            companyName: companyName,
            websiteUrl: websiteUrl,
            aiGuessed: aiGuessed
          }));
        }
        
        toast.success("Account created! Let's set up your profile.");
        navigate("/onboarding", { replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        navigate("/", { replace: true });
      }
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const oauthRedirect = `${window.location.origin}/auth`;

  const handleGoogleSignIn = async () => {
    try {
      const { lovable } = await import("@/integrations/lovable/index");
      const { error } = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || "Google sign-in failed");
    }
  };

  const handleLinkedInSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "linkedin_oidc",
        options: { redirectTo: oauthRedirect },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || "LinkedIn sign-in failed");
    }
  };

  const handleXSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "twitter",
        options: { redirectTo: oauthRedirect },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || "X sign-in failed");
    }
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen" style={{ backgroundColor: "#1F2029" }}>
      {/* Left: Auth Form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 sm:px-8">
        <div className="w-full max-w-md space-y-6">
          {/* Header - Only for signup */}
          {mode === "signup" ? (
            <div className="space-y-3 mb-8">
              <h1 className="text-3xl font-bold tracking-tight text-slate-50">
                Time to level up. Let's get started.
              </h1>
            </div>
          ) : (
            <div className="space-y-2 mb-8">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-600">
                  <Terminal className="h-4 w-4 text-white" />
                </div>
                <span className="text-lg font-semibold tracking-tight text-slate-50">
                  Founder Copilot
                </span>
              </div>
              <p className="text-sm text-slate-400">
                Sign in to your command center
              </p>
            </div>
          )}

          {/* Email Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-3">
              {mode === "signup" && (
                <div className="flex gap-3">
                  <Input
                    type="text"
                    placeholder="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="h-11 flex-1 text-base bg-slate-800 border-slate-700 text-slate-50 placeholder-slate-500"
                    autoComplete="given-name"
                  />
                  <Input
                    type="text"
                    placeholder="Last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    className="h-11 flex-1 text-base bg-slate-800 border-slate-700 text-slate-50 placeholder-slate-500"
                    autoComplete="family-name"
                  />
                </div>
              )}
              <Input
                type="email"
                placeholder={mode === "signup" ? "your@company.com" : "you@company.com"}
                value={email}
                onChange={handleEmailChange}
                required
                className="h-11 text-base bg-slate-800 border-slate-700 text-slate-50 placeholder-slate-500"
                autoComplete="email"
              />
              <Input
                type="password"
                placeholder={mode === "signup" ? "Create a strong password" : "Password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="h-11 text-base bg-slate-800 border-slate-700 text-slate-50 placeholder-slate-500"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </div>
            <Button type="submit" className="w-full h-11 text-base bg-cyan-600 hover:bg-cyan-700 text-white" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {mode === "login" ? "Sign In" : "Continue"}
            </Button>
          </form>

          {/* Toggle */}
          <div className="pt-2 text-center text-sm text-slate-400">
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              className="font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </div>

          <div className="pt-2 text-center text-xs text-slate-500">
            Our privacy standards are worldclass. Find them{" "}
            <a href="https://TRYVEKTA.COM/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-cyan-400 hover:text-cyan-300 transition-colors underline">
              here
            </a>.
          </div>

          {/* Terms - Only for signup */}
          {mode === "signup" && (
            <p className="text-xs text-center text-slate-500">
              By signing up, you agree to our{" "}
              <a href="#" className="text-cyan-400 hover:underline">Services Agreement</a> and{" "}
              <a href="#" className="text-cyan-400 hover:underline">Data Agreement</a>.
            </p>
          )}

          {/* Divider */}
          <div className="relative pt-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-700" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 text-slate-500" style={{ backgroundColor: "#1F2029" }}>or</span>
            </div>
          </div>

          {/* OAuth — Google, LinkedIn, X on one row */}
          <div className="flex flex-row flex-nowrap gap-2 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              aria-label="Continue with Google"
              className="h-11 min-w-0 flex-1 border-slate-700 text-slate-300 hover:bg-slate-800/50 px-2"
              onClick={handleGoogleSignIn}
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              <span className="ml-2 truncate text-xs sm:text-sm">Google</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-label="Continue with LinkedIn"
              className="h-11 min-w-0 flex-1 border-slate-700 text-slate-300 hover:bg-slate-800/50 px-2"
              onClick={handleLinkedInSignIn}
            >
              <svg className="h-4 w-4 shrink-0 text-[#0A66C2]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
              <span className="ml-2 truncate text-xs sm:text-sm">LinkedIn</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-label="Continue with X"
              className="h-11 min-w-0 flex-1 border-slate-700 text-slate-300 hover:bg-slate-800/50 px-2"
              onClick={handleXSignIn}
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span className="ml-2 truncate text-xs sm:text-sm">X</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Right: App Preview */}
      <div className="hidden lg:flex flex-1 flex-col relative overflow-hidden p-8" style={{ backgroundColor: "#1F2029" }}>
        {/* Gradient glow effects */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-gradient-to-tr from-cyan-500/10 to-blue-500/10 rounded-full blur-[100px]" />

        <div className="relative z-10 flex flex-col h-full">
          {/* App preview mockup */}
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-sm rounded-2xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-xl p-6 shadow-2xl">
              <div className="space-y-6">
                {/* Mock header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-sm font-semibold text-slate-200">Untitled UI</span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="text-xs text-slate-400">Home</span>
                    <span className="text-xs text-slate-400">Dashboard</span>
                    <span className="text-xs text-slate-400">Projects</span>
                  </div>
                </div>

                {/* Mock content */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-100">Leapyear</h3>
                    <p className="text-xs text-slate-400">View an overview of your site's traffic and recently active users.</p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400 mb-2">Site traffic <span className="text-emerald-400">+304%</span></p>
                    <div className="h-16 bg-slate-700/30 rounded-lg border border-slate-700/50" />
                  </div>

                  <div className="pt-2">
                    <p className="text-xs font-medium text-slate-300 mb-2">Access (0)</p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-slate-600" />
                        <div className="flex-1">
                          <p className="text-xs text-slate-300">Sofia Mayers</p>
                          <p className="text-xs text-slate-500">sofia@company.com</p>
                        </div>
                        <span className="text-xs text-slate-400">Admin</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
