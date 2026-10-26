import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, Printer, Search } from "lucide-react";
import { useT } from "../i18n";
import { GLOSSARY } from "../i18n/glossary";
import { GuideView } from "../help/GuideView";
import { GLOSSARY_SLUG, searchGuide, sectionList, type Section } from "../help/content";
import { PageHeader } from "../components/ui";

function GlossaryView() {
  const { td, t } = useT();
  const items = useMemo(() => GLOSSARY.map((g) => ({ ...g, term: td(`glossary.${g.id}.term`) })).sort((a, b) => a.term.localeCompare(b.term, "tr")), [td]);
  return (
    <div>
      <h1 className="mb-2 font-display text-3xl font-semibold tracking-tight">{t("help.glossary")}</h1>
      <p className="mb-6 text-sm text-muted">{t("help.glossaryIntro")}</p>
      <dl className="space-y-6">
        {items.map((g) => (
          <div key={g.id} id={g.id} className="scroll-mt-20 border-b border-line pb-5">
            <dt className="text-base font-semibold">{g.term}</dt>
            <dd className="mt-1 text-sm font-medium text-muted">{td(`glossary.${g.id}.short`)}</dd>
            <dd className="mt-2 space-y-2 text-sm leading-6">{td(`glossary.${g.id}.long`).split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function HelpPage() {
  const { section = "" } = useParams();
  const nav = useNavigate();
  const { t, locale } = useT();
  const [q, setQ] = useState("");
  const sections = useMemo<Section[]>(() => [...sectionList(locale), { slug: GLOSSARY_SLUG, order: 999, title: t("help.glossary"), md: "", headings: [], locale, fallback: false }], [locale, t]);
  const current = sections.find((s) => s.slug === section);
  const idx = current ? sections.indexOf(current) : -1;
  const hits = useMemo(() => (q.trim().length > 1 ? searchGuide(locale, q) : []), [q, locale]);

  useEffect(() => { window.scrollTo?.({ top: 0 }); }, [section]);
  useEffect(() => {
    if (!current) return;
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 80);
  }, [current, location.hash]);

  return (
    <div>
      <PageHeader title={t("help.title")} description={t("help.subtitle")}
        actions={current && <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-muted hover:text-ink print:hidden"><Printer size={15} aria-hidden />{t("help.print")}</button>} />
      <div className="grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="print:hidden lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
          <div className="relative mb-4">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("help.search")} aria-label={t("help.search")}
              className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm placeholder:text-faint focus:border-brand-600 focus:ring-4 focus:ring-brand-600/15" />
          </div>
          <nav aria-label={t("help.toc")}>
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-faint">{t("help.toc")}</p>
            <ol className="space-y-0.5">
              {sections.map((s, i) => {
                const active = s.slug === section;
                return (
                  <li key={s.slug}>
                    <Link to={`/help/${s.slug}`} aria-current={active ? "page" : undefined}
                      className={`flex items-baseline gap-2 rounded-lg px-2 py-1.5 text-sm transition ${active ? "bg-brand-600/10 font-semibold text-brand-ink" : "text-muted hover:bg-hover hover:text-ink"}`}>
                      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-faint">{i + 1}</span><span>{s.title}</span>
                    </Link>
                    {active && s.headings.filter((h) => h.level === 2).length > 0 && (
                      <ul className="mb-1 ml-9 mt-0.5 space-y-0.5 border-l border-line pl-3">
                        {s.headings.filter((h) => h.level === 2).map((h) => (
                          <li key={h.id}><a href={`#${h.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth" }); history.replaceState(null, "", `#${h.id}`); }} className="block truncate py-0.5 text-[13px] text-muted hover:text-ink">{h.text}</a></li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        </aside>

        <article className="min-w-0 max-w-3xl pb-16">
          {q.trim().length > 1 ? (
            <div>
              <p className="mb-4 text-sm text-muted">{hits.length ? t("help.results", { n: hits.length }) : t("help.noResults", { q })}</p>
              <ul className="space-y-2">
                {hits.map((h) => (
                  <li key={`${h.slug}#${h.heading?.id ?? ""}`}>
                    <button type="button" onClick={() => { setQ(""); nav(`/help/${h.slug}${h.heading ? `#${h.heading.id}` : ""}`); }} className="w-full rounded-xl border border-line bg-surface p-3 text-left transition hover:border-line-strong">
                      <p className="text-sm font-semibold">{h.title}{h.heading && <span className="font-normal text-muted"> › {h.heading.text}</span>}</p>
                      <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{h.snippet}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : !section ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {sections.map((s, i) => (
                <Link key={s.slug} to={`/help/${s.slug}`} className="group rounded-xl border border-line bg-surface p-4 shadow-soft transition hover:border-line-strong">
                  <div className="flex items-center gap-2 text-xs font-semibold text-brand-ink"><BookOpen size={14} aria-hidden />{i + 1}</div>
                  <p className="mt-1 font-semibold group-hover:text-brand-ink">{s.title}</p>
                  <p className="mt-1 line-clamp-2 text-[13px] text-muted">{s.slug === GLOSSARY_SLUG ? t("help.glossaryIntro") : s.md.split("\n").find((l) => l.trim() && !l.startsWith("#") && !l.startsWith(">"))?.replace(/[*_`]|\[([^\]]*)\]\([^)]*\)/g, "$1")}</p>
                </Link>
              ))}
            </div>
          ) : !current ? (
            <p className="text-sm text-muted">{t("help.missingSection")}</p>
          ) : (
            <>
              {current.fallback && <p role="status" className="mb-4 rounded-lg border border-info-line bg-info-soft px-3 py-2 text-sm text-info">{t("help.fallbackNotice")}</p>}
              {current.slug === GLOSSARY_SLUG ? <GlossaryView /> : <GuideView md={current.md} />}
              <nav className="mt-12 flex justify-between gap-3 border-t border-line pt-5 print:hidden" aria-label={t("help.sectionNav")}>
                {idx > 0 ? <Link to={`/help/${sections[idx - 1]!.slug}`} className="inline-flex items-center gap-2 text-sm font-medium text-brand-ink hover:underline"><ArrowLeft size={15} aria-hidden /><span><span className="block text-xs text-muted">{t("help.prev")}</span>{sections[idx - 1]!.title}</span></Link> : <span />}
                {idx < sections.length - 1 && <Link to={`/help/${sections[idx + 1]!.slug}`} className="inline-flex items-center gap-2 text-right text-sm font-medium text-brand-ink hover:underline"><span><span className="block text-xs text-muted">{t("help.next")}</span>{sections[idx + 1]!.title}</span><ArrowRight size={15} aria-hidden /></Link>}
              </nav>
            </>
          )}
        </article>
      </div>
    </div>
  );
}
