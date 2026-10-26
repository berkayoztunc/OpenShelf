import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { LEGAL_KEYS, type LegalKey } from "../api/types";
import { useI18n } from "../i18n";
import type { MessageKey } from "../i18n/messages";
import { useHead } from "../lib/head";
import { pageTitle } from "../lib/seo";
import { legalTitle, useConfig } from "../store/ConfigContext";
import NotFound from "./NotFound";

export default function Legal() {
  const { key = "" } = useParams();
  const valid = (LEGAL_KEYS as readonly string[]).includes(key);
  if (!valid) return <NotFound />;
  return <LegalView k={key as LegalKey} />;
}

function LegalView({ k }: { k: LegalKey }) {
  const { t, locale } = useI18n();
  const { config } = useConfig();
  const q = useQuery({ queryKey: ["legal", k, locale], queryFn: () => api.legal(k, locale) });
  const title = q.data?.title || legalTitle(config, k) || t(`legal.${k}` as MessageKey);
  useHead({ title: pageTitle(config, title) });
  if (q.isError) return <NotFound />;
  return (
    <article className="container-x max-w-3xl py-12">
      <h1 className="font-display text-3xl">{title}</h1>
      <div className="prose-legal mt-8 text-sm">
        {q.isLoading ? <div className="skeleton h-40" /> : /* Plain text only: never inject HTML from settings. */
          (q.data?.content ?? "").split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
      </div>
    </article>
  );
}
