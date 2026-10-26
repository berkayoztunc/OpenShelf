import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { setLocale } from "../i18n";

// The product default is Turkish; existing tests assert the English copy, so tests run in English unless they opt in.
beforeEach(() => setLocale("en"));
afterEach(() => { cleanup(); setLocale("en"); });
