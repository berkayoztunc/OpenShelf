import { createContext, useContext, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, ApiError, errMsg, setUnauthorizedHandler } from "./api";
import type { Admin } from "./types";
import { Loading } from "../components/ui";
import { useT } from "../i18n";

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
  const qc = useQueryClient();
  const me = useMe();
  const { t } = useT();

  useEffect(() => {
    setUnauthorizedHandler(() => { qc.removeQueries(); nav("/login", { replace: true }); });
  }, [nav, qc]);

  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) nav("/login", { replace: true });
  }, [me.error, nav]);

  const value = useMemo(() => ({ admin: me.data?.admin ?? null }), [me.data]);
  if (me.isPending) return <Loading label={t("auth.session.checking")} />;
  if (!me.data) return me.error instanceof ApiError && me.error.status === 401 ? <Loading /> : <div className="p-8"><p role="alert">{t("auth.session.unreachable")} {me.error ? errMsg(me.error) : ""}</p></div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
