import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Terminal, Zap, Shield, TrendingUp, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

export default function Auth() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) navigate("/", { replace: true });
  }, [user, authLoading, navigate]);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
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
            data: { first_name: firstName, last_name: lastName }
          }
        });
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

  const handleAppleSignIn = async () => {
    try {
      const { lovable } = await import("@/integrations/lovable/index");
      const { error } = await lovable.auth.signInWithOAuth("apple", {
        redirect_uri: window.location.origin,
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || "Apple sign-in failed");
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
                Start your 14-day free trial
              </h1>
              <p className="text-sm text-slate-400">
                No credit card needed.
              </p>
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
                    placeholder="First Name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="h-11 text-base bg-slate-800 border-slate-700 text-slate-50 placeholder-slate-500"
                    autoComplete="given-name"
                  />
                  <Input
                    type="text"
                    placeholder="Last Name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    className="h-11 text-base bg-slate-800 border-slate-700 text-slate-50 placeholder-slate-500"
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

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-700" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 text-slate-500" style={{ backgroundColor: "#1F2029" }}>or</span>
            </div>
          </div>

          {/* OAuth buttons */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-11 border-slate-700 text-slate-300 hover:bg-slate-800/50"
              onClick={handleGoogleSignIn}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-11 border-slate-700 text-slate-300 hover:bg-slate-800/50"
              onClick={handleAppleSignIn}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
            </Button>
          </div>

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
        </div>
      </div>

      {/* Right: App Preview */}
      <div className="hidden lg:flex flex-1 flex-col relative overflow-hidden p-8" style={{ backgroundColor: "#1F2029" }}>
        {/* Gradient glow effects */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-gradient-to-tr from-cyan-500/10 to-blue-500/10 rounded-full blur-[100px]" />

        <div className="relative z-10 flex flex-col h-full">
          {/* Top branding */}
          <div className="mb-12">
            <p className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Secure access for everyone. But not just anyone.
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Untitled is a powerful, flexible authentication and authorization platform<br />
              that's easy to integrate and built to scale with your application.
            </p>
          </div>

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
