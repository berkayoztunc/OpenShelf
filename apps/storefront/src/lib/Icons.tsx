import type { LucideProps } from "lucide-react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Minus, Moon, Plus, Search, ShieldCheck, ShoppingBag, Sun, Truck, RotateCcw, X, Headphones, Lock, Sparkles, Package, Armchair, UtensilsCrossed, Gem, Flower2, Shirt, Home, Heart } from "lucide-react";

/** Thin wrappers over lucide-react keeping the original names/props used across the storefront. */
const d = { size: 20, strokeWidth: 1.75, "aria-hidden": true } as const;
export const BagIcon = (p: LucideProps) => <ShoppingBag {...d} {...p} />;
export const SearchIcon = (p: LucideProps) => <Search {...d} {...p} />;
export const SunMoonIcon = (p: LucideProps) => (
  <span className="relative inline-grid size-5 place-items-center" aria-hidden>
    <Sun {...d} {...p} className={`absolute transition duration-300 dark:scale-0 dark:-rotate-90 dark:opacity-0 ${p.className ?? ""}`} />
    <Moon {...d} {...p} className={`absolute scale-0 rotate-90 opacity-0 transition duration-300 dark:scale-100 dark:rotate-0 dark:opacity-100 ${p.className ?? ""}`} />
  </span>
);
export const CloseIcon = (p: LucideProps) => <X {...d} {...p} />;
export const ChevronIcon = ({ dir = "right", ...p }: LucideProps & { dir?: "left" | "right" }) => (dir === "right" ? <ChevronRight {...d} {...p} /> : <ChevronLeft {...d} {...p} />);
export const MinusIcon = (p: LucideProps) => <Minus {...d} {...p} />;
export const PlusIcon = (p: LucideProps) => <Plus {...d} {...p} />;
export const ArrowIcon = (p: LucideProps) => <ArrowRight {...d} {...p} />;
export const CheckIcon = (p: LucideProps) => <Check {...d} {...p} />;
export const ShieldIcon = (p: LucideProps) => <ShieldCheck {...d} {...p} />;
export const TruckIcon = (p: LucideProps) => <Truck {...d} {...p} />;
export const ReturnIcon = (p: LucideProps) => <RotateCcw {...d} {...p} />;
export const SupportIcon = (p: LucideProps) => <Headphones {...d} {...p} />;
export const LockIcon = (p: LucideProps) => <Lock {...d} {...p} />;
export const SparkIcon = (p: LucideProps) => <Sparkles {...d} {...p} />;
export const PackageIcon = (p: LucideProps) => <Package {...d} {...p} />;
export const HeartIcon = (p: LucideProps) => <Heart {...d} {...p} />;
export const HomeIcon = (p: LucideProps) => <Home {...d} {...p} />;
/** Decorative icons for category cards that have no photo. */
export const CATEGORY_ICONS = [Armchair, UtensilsCrossed, Gem, Flower2, Shirt, Package];
