import { Link } from "react-router-dom";
import { useI18n } from "../i18n";
import { useHead } from "../lib/head";

export default function NotFound({ product = false }: { product?: boolean }) {
  const { t } = useI18n();
  useHead({ title: t("nf.title"), noindex: true });
  return (
    <div className="container-x py-24 text-center">
      <p className="font-display text-6xl text-brand-ink">404</p>
      <h1 className="mt-4 font-display text-2xl">{product ? t("product.notFound") : t("nf.title")}</h1>
      <p className="mt-2 text-muted">{t("nf.body")}</p>
      <Link to="/" className="btn-primary mt-8">{t("nf.home")}</Link>
    </div>
  );
}
