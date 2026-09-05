import { LogOut } from "lucide-react";
import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Nav, type NavLink } from "@/components/Nav";
import { Live } from "@/components/Live";
import { signOut } from "@/lib/actions";

const LINKS: NavLink[] = [
  { href: "/", label: "Downloads", icon: "downloads" },
  { href: "/spotify", label: "Spotify", icon: "spotify" },
];

export function AppSidebar({ running }: { running: number }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <span className="flex size-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                  R
                </span>
                <span className="font-semibold tracking-tight">
                  reel<span className="text-muted-foreground">.euronic</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <Nav links={LINKS} />
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter>
        <div className="flex flex-col gap-1 px-2 py-1 text-sm">
          <span className="text-xs text-muted-foreground">
            {running === 0 ? "idle" : `${running} downloading`}
          </span>
          <Live />
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <form action={signOut}>
              <SidebarMenuButton asChild tooltip="Sign out">
                <button type="submit" className="w-full">
                  <LogOut />
                  <span>Sign out</span>
                </button>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
