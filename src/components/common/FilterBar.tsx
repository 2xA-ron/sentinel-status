import { Filter, Search, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Search + filter controls. On small viewports the filter controls move into a
 * bottom sheet so the same controls stay reachable without shrinking.
 */
export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  filters,
  activeCount = 0,
  onClear,
  trailing,
  className,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  activeCount?: number;
  onClear?: () => void;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="h-9 pl-8 font-mono text-xs"
        />
        {search ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onSearchChange("")}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {filters ? (
        <>
          <div className="hidden items-center gap-2 md:flex">{filters}</div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 md:hidden">
                <Filter className="size-3.5" aria-hidden />
                Filters
                {activeCount > 0 ? (
                  <span className="bg-primary text-primary-foreground ml-1 rounded-full px-1.5 text-[10px]">
                    {activeCount}
                  </span>
                ) : null}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="grid gap-3 px-4 pb-6">{filters}</div>
            </SheetContent>
          </Sheet>
        </>
      ) : null}

      {activeCount > 0 && onClear ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="text-muted-foreground hidden h-9 md:inline-flex"
        >
          Clear filters
        </Button>
      ) : null}

      {trailing ? <div className="ml-auto flex items-center gap-2">{trailing}</div> : null}
    </div>
  );
}
