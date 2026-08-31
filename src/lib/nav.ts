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
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Pedidos", href: "/pedidos", icon: ReceiptText },
  { label: "Cardápio", href: "/cardapio", icon: BookOpen },
  { label: "Clientes", href: "/clientes", icon: Users },
  { label: "Estoque", href: "/estoque", icon: Boxes },
  { label: "Financeiro", href: "/financeiro", icon: TrendingUp },
  { label: "Atendimento IA", href: "/atendimento-ia", icon: Bot },
  { label: "Configurações", href: "/configuracoes", icon: Settings },
];
