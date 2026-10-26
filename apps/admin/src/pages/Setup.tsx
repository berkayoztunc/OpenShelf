import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, errMsg } from "../lib/api";
import { Button, Loading, PasswordField, TextField } from "../components/ui";
import { AuthShell } from "./Login";
import { useT } from "../i18n";

export function SetupPage() {
  const { t } = useT();
  const nav = useNavigate();
  const status = useQuery({ queryKey: ["setup-status"], queryFn: () => api.get<{ needsSetup: boolean }>("/api/admin/setup/status"), retry: false });
  const [f, setF] = useState({ setupToken: "", name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => { if (status.data && !status.data.needsSetup) nav("/login", { replace: true }); }, [status.data, nav]);

  const create = useMutation({
    mutationFn: () => api.post("/api/admin/setup", { setupToken: f.setupToken, email: f.email, name: f.name, password: f.password }),
    onSuccess: () => nav("/login", { replace: true }),
    onError: (e) => setError(errMsg(e)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (f.password.length < 12) return setError(t("auth.setup.short"));
    if (f.password !== f.confirm) return setError(t("auth.setup.mismatch"));
    setError(""); create.mutate();
  };
  if (status.isPending) return <Loading />;

  return (
    <AuthShell title={t("auth.setup.title")} subtitle={t("auth.setup.subtitle")}>
      <form onSubmit={submit} className="space-y-4">
        <TextField label={t("auth.setup.token")} help="shell.setupToken" required autoComplete="off" spellCheck={false} value={f.setupToken} onChange={set("setupToken")} />
        <TextField label={t("auth.setup.name")} required autoComplete="name" value={f.name} onChange={set("name")} />
        <TextField label={t("auth.setup.email")} type="email" required autoComplete="username" value={f.email} onChange={set("email")} />
        <PasswordField label={t("auth.setup.password")} help="shell.password" required minLength={12} autoComplete="new-password" hint={t("auth.setup.passwordHint")} value={f.password} onChange={set("password")} />
        <PasswordField label={t("auth.setup.confirm")} required autoComplete="new-password" value={f.confirm} onChange={set("confirm")} />
        {error && <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" className="w-full !h-10" loading={create.isPending}>{t("auth.setup.submit")}</Button>
      </form>
    </AuthShell>
  );
}
