"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Download, ListMusic, type LucideIcon } from "lucide-react";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

const ICONS: Record<string, LucideIcon> = {
  downloads: Download,
  spotify: ListMusic,
};

export type NavLink = { href: string; label: string; icon: keyof typeof ICONS };

export function Nav({ links }: { links: NavLink[] }) {
  const here = usePathname();
  return (
    <SidebarMenu>
      {links.map((link) => {
        const on = link.href === "/" ? here === "/" || here.startsWith("/jobs") : here.startsWith(link.href);
        const Icon = ICONS[link.icon];
        return (
          <SidebarMenuItem key={link.href}>
            <SidebarMenuButton asChild isActive={on} tooltip={link.label}>
              <Link href={link.href}>
                <Icon />
                <span>{link.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
