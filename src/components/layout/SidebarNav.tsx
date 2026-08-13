import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, ShieldAlert } from "lucide-react";
import { navItems } from "./nav-items";
import { cn } from "@/lib/utils";

export function SidebarNav({
  collapsed,
  onToggle,
  activeIncidents,
}: {
  collapsed: boolean;
  onToggle: () => void;
  activeIncidents: number;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside
      className={cn(
        "bg-sidebar border-sidebar-border hidden shrink-0 flex-col border-r transition-[width] duration-150 md:flex",
        collapsed ? "w-14" : "w-56",
      )}
      aria-label="Primary"
    >
      <div className="border-sidebar-border flex h-12 items-center gap-2 border-b px-3">
        <ShieldAlert className="text-primary size-5 shrink-0" aria-hidden />
        {!collapsed && (
          <span className="truncate font-mono text-sm font-semibold tracking-tight">
            SentinelOps
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 p-2">
        {navItems.map((item) => {
          const active =
            item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded px-2 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                collapsed && "justify-center px-0",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {!collapsed && item.to === "/incidents" && activeIncidents > 0 ? (
                <span className="bg-status-down-soft text-status-down ml-auto rounded px-1.5 py-0.5 font-mono text-[10px]">
                  {activeIncidents}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-sidebar-border border-t p-2">
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="text-muted-foreground hover:bg-sidebar-accent hover:text-foreground flex w-full items-center justify-center gap-2 rounded px-2 py-2 text-xs transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="size-4" aria-hidden />
          ) : (
            <>
              <ChevronLeft className="size-4" aria-hidden />
              Collapse
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
