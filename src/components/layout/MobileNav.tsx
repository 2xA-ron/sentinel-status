import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { navItems } from "./nav-items";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function MobileNav({ activeIncidents }: { activeIncidents: number }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9 md:hidden" aria-label="Open menu">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2 font-mono text-sm">
            <ShieldAlert className="text-primary size-4" aria-hidden />
            SentinelOps
          </SheetTitle>
        </SheetHeader>
        <nav className="space-y-0.5 p-2" aria-label="Primary">
          {navItems.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded px-3 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-foreground hover:bg-sidebar-accent/60",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
                {item.to === "/incidents" && activeIncidents > 0 ? (
                  <span className="bg-status-down-soft text-status-down ml-auto rounded px-1.5 py-0.5 font-mono text-[10px]">
                    {activeIncidents}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

/** Bottom tab bar for the most common mobile workflows. */
export function MobileTabBar({ activeIncidents }: { activeIncidents: number }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = navItems.filter((i) => ["/", "/monitors", "/incidents", "/status"].includes(i.to));

  return (
    <nav
      aria-label="Quick navigation"
      className="bg-surface border-border fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map((item) => {
        const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "relative flex min-h-14 flex-col items-center justify-center gap-1 text-[11px]",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {item.label}
            {item.to === "/incidents" && activeIncidents > 0 ? (
              <span className="bg-status-down absolute top-2 right-[26%] size-1.5 rounded-full" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
