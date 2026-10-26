import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errMsg } from "../lib/api";
import type { Admin } from "../lib/types";
import { CreditCard, Package, ShieldCheck, Store } from "lucide-react";
import { Button, PasswordField, TextField } from "../components/ui";
import { LocaleSwitch } from "../components/LocaleSwitch";
import { GuideLink } from "../components/help/GuideLink";
import { useT } from "../i18n";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  const { t } = useT();
  const features: [typeof Package, string][] = [[Package, t("auth.hero.f1")], [CreditCard, t("auth.hero.f2")], [ShieldCheck, t("auth.hero.f3")]];
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="hero-mesh relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex" aria-hidden>
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full border border-white/10" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 size-[28rem] rounded-full border border-white/10" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur"><Store size={20} /></span>
          <span className="font-display text-2xl font-semibold tracking-tight">OpenShelf</span>
        </div>
        <div className="relative max-w-md">
          <p className="font-display text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">{t("auth.hero.title")}</p>
          <p className="mt-4 text-base text-white/80">{t("auth.hero.body")}</p>
          <ul className="mt-8 space-y-3 text-sm">
            {features.map(([Icon, text]) => (
              <li key={text} className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-white/12 ring-1 ring-white/20"><Icon size={16} /></span>{text}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/60">{t("auth.hero.tagline")}</p>
      </aside>
      <main className="relative flex items-center justify-center p-6 pt-16 sm:p-10">
        <div className="absolute right-4 top-4 flex items-center gap-3"><GuideLink guide="getting-started#ilk-giris">{t("auth.guide")}</GuideLink><LocaleSwitch /></div>
        <div className="page-in w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-9 place-items-center rounded-xl bg-brand-600 text-white"><Store size={18} /></span>
            <span className="font-display text-xl font-semibold">OpenShelf</span>
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mb-7 mt-2 text-sm text-muted">{subtitle}</p>
          {children}
          {footer && <div className="mt-6 rounded-lg border border-dashed border-line bg-surface/60 px-3.5 py-3 text-xs text-muted">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export function LoginPage() {
  const { t } = useT();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [mfa, setMfa] = useState(false);
  const [error, setError] = useState("");

  const status = useQuery({ queryKey: ["setup-status"], queryFn: () => api.get<{ needsSetup: boolean }>("/api/admin/setup/status"), retry: false });
  useEffect(() => { if (status.data?.needsSetup) nav("/setup", { replace: true }); }, [status.data, nav]);

  const login = useMutation({
    mutationFn: () => api.post<{ admin: Admin; csrfToken: string; mfaRequired?: true }>("/api/admin/auth/login", { email, password, ...(mfa ? { totp } : {}) }),
    onSuccess: async (res) => {
      if (res.mfaRequired) { setMfa(true); setError(""); return; }
      api.setCsrf(res.csrfToken);
      qc.setQueryData(["me"], { admin: res.admin, csrfToken: res.csrfToken });
      nav("/", { replace: true });
    },
    onError: (e) => setError(e instanceof ApiError && e.status === 429 ? t("auth.login.tooMany") : errMsg(e)),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(""); login.mutate(); };

  return (
    <AuthShell title={mfa ? t("auth.login.mfaTitle") : t("auth.login.title")} subtitle={mfa ? t("auth.login.mfaSubtitle") : t("auth.login.subtitle")}
      footer={mfa ? undefined : <>{t("auth.login.forgot")}<br />{t("auth.login.demoHint")}</>}>
      <form onSubmit={submit} className="space-y-4">
        {!mfa ? (
          <>
            <TextField label={t("auth.login.email")} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <PasswordField label={t("auth.login.password")} help="shell.password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </>
        ) : (
          <TextField label={t("auth.login.code")} help="shell.loginCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))} />
        )}
        {error && <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" className="w-full !h-10" loading={login.isPending}>{mfa ? t("auth.login.verify") : t("auth.login.submit")}</Button>
        {mfa && <Button variant="ghost" className="w-full" onClick={() => { setMfa(false); setTotp(""); }}>{t("common.back")}</Button>}
      </form>
    </AuthShell>
  );
}
