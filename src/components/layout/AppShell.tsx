import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { dashboardApi } from "@/lib/api";
import { qk } from "@/lib/query/keys";
import { SidebarNav } from "./SidebarNav";
import { TopBar } from "./TopBar";
import { MobileTabBar } from "./MobileNav";
import { CommandPalette, useCommandPalette } from "./CommandPalette";

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useLocalStorage("sentinelops.sidebar.collapsed", false);
  const { open, setOpen } = useCommandPalette();

  const { data: summary } = useQuery({
    queryKey: qk.dashboardSummary(),
    queryFn: () => dashboardApi.summary(),
  });
  const activeIncidents = summary?.activeIncidents ?? 0;

  return (
    <div className="bg-background text-foreground flex min-h-screen">
      <SidebarNav
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        activeIncidents={activeIncidents}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar activeIncidents={activeIncidents} onOpenPalette={() => setOpen(true)} />
        <main className="min-w-0 flex-1 px-3 pt-4 pb-24 sm:px-4 md:px-6 md:pb-8">{children}</main>
        <MobileTabBar activeIncidents={activeIncidents} />
      </div>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </div>
  );
}
