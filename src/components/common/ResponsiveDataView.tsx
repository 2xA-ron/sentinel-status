import type { ReactNode } from "react";
import { DataTable, applySort, type Column, type SortState } from "./DataTable";
import { cn } from "@/lib/utils";

/**
 * Renders a dense table on desktop and compact rows on small viewports from a
 * single data + sort definition, so pages never duplicate their logic.
 */
export function ResponsiveDataView<T>({
  rows,
  columns,
  getRowId,
  sort,
  onSortChange,
  onRowClick,
  renderCompact,
  emptyState,
  className,
  breakpoint = "lg",
}: {
  rows: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  sort?: SortState | undefined;
  onSortChange?: (sort: SortState) => void;
  onRowClick?: (row: T) => void;
  renderCompact: (row: T) => ReactNode;
  emptyState?: ReactNode;
  className?: string;
  breakpoint?: "md" | "lg";
}) {
  const sorted = applySort(rows, columns, sort);
  const tableClass = breakpoint === "md" ? "hidden md:block" : "hidden lg:block";
  const listClass = breakpoint === "md" ? "md:hidden" : "lg:hidden";

  return (
    <div className={className}>
      <div className={tableClass}>
        <DataTable
          rows={rows}
          columns={columns}
          getRowId={getRowId}
          sort={sort}
          onSortChange={onSortChange}
          onRowClick={onRowClick}
          emptyState={emptyState}
        />
      </div>
      <div className={listClass}>
        {sorted.length === 0
          ? emptyState
          : sorted.map((row) => (
              <div
                key={getRowId(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter") onRowClick(row);
                      }
                    : undefined
                }
                role={onRowClick ? "button" : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={cn(
                  "border-border border-b px-3 py-3 last:border-b-0",
                  onRowClick && "active:bg-accent/50 cursor-pointer",
                )}
              >
                {renderCompact(row)}
              </div>
            ))}
      </div>
    </div>
  );
}
