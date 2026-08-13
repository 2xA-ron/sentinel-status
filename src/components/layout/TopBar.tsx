import { Moon, Search, Sun, Laptop } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MobileNav } from "./MobileNav";
import { RealtimeConnectionIndicator } from "@/components/common/RealtimeConnectionIndicator";
import { useTheme } from "@/hooks/use-theme";

export function TopBar({
  activeIncidents,
  onOpenPalette,
}: {
  activeIncidents: number;
  onOpenPalette: () => void;
}) {
  const { preference, setPreference } = useTheme();

  return (
    <header className="bg-surface/90 border-border sticky top-0 z-30 flex h-12 items-center gap-2 border-b px-2 backdrop-blur sm:px-4">
      <MobileNav activeIncidents={activeIncidents} />
      <span className="font-mono text-sm font-semibold tracking-tight md:hidden">SentinelOps</span>

      <button
        type="button"
        onClick={onOpenPalette}
        className="text-muted-foreground border-border hover:bg-accent/50 ml-auto hidden h-8 w-64 items-center gap-2 rounded border px-2 text-xs transition-colors md:flex"
      >
        <Search className="size-3.5" aria-hidden />
        Search…
        <kbd className="bg-muted ml-auto rounded px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
      </button>

      <Button
        variant="ghost"
        size="icon"
        className="ml-auto size-9 md:hidden"
        aria-label="Search"
        onClick={onOpenPalette}
      >
        <Search className="size-4" />
      </Button>

      <RealtimeConnectionIndicator className="hidden sm:inline-flex" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-9" aria-label="Toggle theme">
            <Sun className="size-4 dark:hidden" />
            <Moon className="hidden size-4 dark:block" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setPreference("light")} data-active={preference === "light"}>
            <Sun className="size-4" aria-hidden /> Light
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPreference("dark")} data-active={preference === "dark"}>
            <Moon className="size-4" aria-hidden /> Dark
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPreference("system")} data-active={preference === "system"}>
            <Laptop className="size-4" aria-hidden /> System
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
