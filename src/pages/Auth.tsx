import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Terminal, Zap, Shield, TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

export default function Auth() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) navigate("/", { replace: true });
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
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

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Left: Auth Form */}
      <div className="flex flex-1 flex-col items-center justify-center px-8 bg-background">
        <div className="w-full max-w-sm space-y-8">
          {/* Branding */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Terminal className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-semibold tracking-tight text-foreground">
                Founder Copilot
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {mode === "login" ? "Sign in to your command center" : "Create your account to get started"}
            </p>
          </div>

          {/* Google OAuth */}
          <Button
            variant="outline"
            className="w-full gap-2 h-11"
            onClick={handleGoogleSignIn}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-3 text-muted-foreground">or</span>
            </div>
          </div>

          {/* Email Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
                autoComplete="email"
              />
              <Input
                type="password"
                placeholder="Password (min 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="h-11"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </div>
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {mode === "login" ? "Sign In" : "Create Account"}
            </Button>
          </form>

          {/* Toggle */}
          <p className="text-center text-sm text-muted-foreground">
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              className="font-medium text-accent hover:text-accent/80 transition-colors"
            >
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>

      {/* Right: Dark Terminal Aesthetic */}
      <div className="hidden lg:flex flex-1 flex-col items-center justify-center bg-primary relative overflow-hidden">
        {/* Glow effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-accent/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-accent/5 rounded-full blur-[100px]" />

        <div className="relative z-10 space-y-8 max-w-md text-center px-8">
          {/* Terminal window mock */}
          <div className="rounded-xl border border-primary-foreground/10 bg-primary-foreground/5 backdrop-blur-sm p-6 text-left font-mono text-sm">
            <div className="flex items-center gap-1.5 mb-4">
              <div className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
              <div className="h-2.5 w-2.5 rounded-full bg-warning/60" />
              <div className="h-2.5 w-2.5 rounded-full bg-success/60" />
              <span className="ml-2 text-[10px] text-primary-foreground/40">founder-copilot</span>
            </div>
            <div className="space-y-1.5 text-primary-foreground/70">
              <p><span className="text-success/80">$</span> analyzing company profile...</p>
              <p><span className="text-success/80">$</span> scraping competitive landscape...</p>
              <p><span className="text-success/80">$</span> matching investors from 2,400+ VCs...</p>
              <p className="text-accent">✓ 12 high-match investors found</p>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-primary-foreground tracking-tight">
              Your AI-Powered<br />Fundraising Command Center
            </h2>
            <div className="flex flex-col gap-3 text-sm text-primary-foreground/60">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-accent shrink-0" />
                <span>Real-time investor discovery via Exa AI</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-accent shrink-0" />
                <span>Automated due diligence scoring</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-accent shrink-0" />
                <span>Competitive benchmarking & health metrics</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
