import { common } from "./common";
import { nav } from "./nav";
import { enums } from "./enums";
import { glossary } from "./glossary";
import { helpui } from "./helpui";
import { shell } from "./shell";
import { dashboard } from "./dashboard";
import { orders } from "./orders";
import { invoices } from "./invoices";
import { emails } from "./emails";
import { print } from "./print";
import { catalog } from "./catalog";
import { settings } from "./settings";
import { security } from "./security";
import { integrations } from "./integrations";
import { errors } from "./errors";
import { trendyol } from "./trendyol";
import { trendyolviews } from "./trendyolviews";

/** Merged dictionary. Each namespace file is owned by one area (see docs/admin-i18n.md). */
export const tr = { ...common, ...nav, ...enums, ...glossary, ...helpui, ...shell, ...dashboard, ...orders, ...invoices, ...emails, ...print, ...catalog, ...settings, ...security, ...integrations, ...errors, ...trendyol, ...trendyolviews, };
