import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { navItems } from "./nav-items";
import { monitorsApi, incidentsApi } from "@/lib/api";
import { qk } from "@/lib/query/keys";
import { StatusDot } from "@/components/common/status";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { data: monitors = [] } = useQuery({
    queryKey: qk.monitors(),
    queryFn: () => monitorsApi.list(),
    enabled: open,
  });
  const { data: incidents = [] } = useQuery({
    queryKey: qk.incidents(),
    queryFn: () => incidentsApi.list(),
    enabled: open,
  });

  const go = (to: string) => {
    onOpenChange(false);
    void navigate({ to });
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search monitors, incidents, pages…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {navItems.map((item) => (
            <CommandItem key={item.to} value={`nav ${item.label}`} onSelect={() => go(item.to)}>
              <item.icon className="size-4" aria-hidden />
              {item.label}
              <span className="text-muted-foreground ml-auto text-[11px]">{item.description}</span>
            </CommandItem>
          ))}
          <CommandItem value="create monitor new" onSelect={() => go("/monitors/new")}>
            New monitor
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Monitors">
          {monitors.slice(0, 8).map((m) => (
            <CommandItem
              key={m.id}
              value={`monitor ${m.name} ${m.url}`}
              onSelect={() => go(`/monitors/${m.id}`)}
            >
              <StatusDot status={m.currentStatus} />
              {m.name}
              <span className="text-muted-foreground ml-auto truncate font-mono text-[11px]">
                {m.url}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Incidents">
          {incidents.slice(0, 6).map((i) => (
            <CommandItem
              key={i.id}
              value={`incident ${i.id} ${i.title}`}
              onSelect={() => go(`/incidents/${i.id}`)}
            >
              <span className="font-mono text-[11px]">{i.id}</span>
              <span className="truncate">{i.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // e.key can be undefined for some synthesized keydown events (autofill, IME
      // composition, some virtual keyboards) — guard before calling toLowerCase().
      if (e.key?.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}
