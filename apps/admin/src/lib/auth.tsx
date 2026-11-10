import { createContext, useContext, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { api, ApiError, errMsg, setUnauthorizedHandler } from "./api";
import type { Admin } from "./types";
import { Loading } from "../components/ui";
import { useT } from "../i18n";
import { safeNext } from "./next";

interface Me { admin: Admin; csrfToken: string }
const Ctx = createContext<{ admin: Admin | null }>({ admin: null });
export const useAdmin = () => useContext(Ctx).admin;

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const me = await api.get<Me>("/api/admin/auth/me");
      api.setCsrf(me.csrfToken);
      return me;
    },
    retry: false,
    staleTime: 5 * 60_000,
  });
}

/** Wraps protected routes: resolves session, redirects to /login on 401 (or /setup when first-run). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const me = useMe();
  const { t } = useT();
  // remember where the user was going (e.g. the OAuth consent page) so login brings them back
  const here = loc.pathname + loc.search;
  const toLogin = () => nav(here !== "/" && safeNext(here) === here ? `/login?next=${encodeURIComponent(here)}` : "/login", { replace: true });

  useEffect(() => {
    setUnauthorizedHandler(() => { qc.removeQueries(); toLogin(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, qc, here]);

  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) toLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.error, nav, here]);

  const value = useMemo(() => ({ admin: me.data?.admin ?? null }), [me.data]);
  if (me.isPending) return <Loading label={t("auth.session.checking")} />;
  if (!me.data) return me.error instanceof ApiError && me.error.status === 401 ? <Loading /> : <div className="p-8"><p role="alert">{t("auth.session.unreachable")} {me.error ? errMsg(me.error) : ""}</p></div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
