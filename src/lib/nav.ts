import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ReceiptText,
  BookOpen,
  Users,
  Boxes,
  TrendingUp,
  Bot,
  Settings,
  MessageSquareHeart,
  Wrench,
  Calculator,
  Key,
} from "lucide-react";

import type { WhatsappAgentDomain } from "@/generated/prisma";

/** The Restaurant fields a nav item's visibility can depend on. */
export type RestaurantNavFlags = { whatsappAgentDomain: WhatsappAgentDomain };

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /// Omitted means always visible, same as every item before this field
  /// existed. Used for a feature that only applies to one of the 5 agent
  /// products' ICP (e.g. "Despacho" is irrelevant to a restaurant tenant) —
  /// a predicate rather than a single boolean field name so it composes
  /// cleanly as whatsappAgentDomain grows a 4th/5th value later.
  visibleWhen?: (restaurant: RestaurantNavFlags) => boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Pedidos", href: "/pedidos", icon: ReceiptText },
  { label: "Cardápio", href: "/cardapio", icon: BookOpen },
  { label: "Clientes", href: "/clientes", icon: Users },
  { label: "Estoque", href: "/estoque", icon: Boxes },
  { label: "Financeiro", href: "/financeiro", icon: TrendingUp },
  { label: "Atendimento IA", href: "/atendimento-ia", icon: Bot },
  { label: "Despacho", href: "/despacho", icon: Wrench, visibleWhen: (r) => r.whatsappAgentDomain === "DESPACHO" },
  { label: "Orçamentos", href: "/orcamentos", icon: Calculator, visibleWhen: (r) => r.whatsappAgentDomain === "ORCAMENTO" },
  { label: "Candidaturas", href: "/candidaturas", icon: Key, visibleWhen: (r) => r.whatsappAgentDomain === "LOCACAO" },
  { label: "Feedbacks", href: "/feedbacks", icon: MessageSquareHeart },
  { label: "Configurações", href: "/configuracoes", icon: Settings },
];

/**
 * Which hrefs a given tenant should see. Deliberately returns plain
 * strings, not NavItem[] — NAV_ITEMS carries Lucide icon COMPONENTS
 * (functions), which the Server Component (app)/layout.tsx that calls this
 * cannot pass as a prop into a "use client" component (Sidebar/MobileNav):
 * React refuses to serialize a function across that boundary ("Functions
 * cannot be passed directly to Client Components" — a real bug hit and
 * fixed during Agente 3's verification). A plain string[] of hrefs crosses
 * that boundary fine; Sidebar/MobileNav still import NAV_ITEMS themselves
 * and only use this list to filter it client-side.
 */
export function getVisibleNavHrefs(restaurant: RestaurantNavFlags): string[] {
  return NAV_ITEMS.filter((item) => !item.visibleWhen || item.visibleWhen(restaurant)).map((item) => item.href);
}
