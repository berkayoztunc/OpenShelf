import type { SelectHTMLAttributes } from "react";
import { ChevronDownIcon } from "../lib/Icons";

/**
 * Native <select> (keeps the phone's own picker, keyboard and screen-reader behaviour) with the OS arrow replaced by one that matches
 * the storefront: same height, radius, focus ring and dark theme as the other form fields, and room for long option text.
 */
export function Select({ className = "", wrapperClassName = "", children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }) {
  return (
    <span className={`relative inline-block max-w-full ${wrapperClassName}`}>
      <select {...p} className={`field cursor-pointer truncate font-medium disabled:cursor-not-allowed disabled:opacity-60 ${className}`}>{children}</select>
      <ChevronDownIcon size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
    </span>
  );
}
