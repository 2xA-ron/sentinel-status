import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  className?: string;
  headerClassName?: string;
  /** Hide on narrower desktop widths to keep density readable. */
  hideBelow?: "lg" | "xl";
}

export interface SortState {
  columnId: string;
  direction: "asc" | "desc";
}

/**
 * Dense table primitive. Rows are plain DOM nodes so a virtualizer can be
 * layered on later without changing the column API.
 */
export function DataTable<T>({
  rows,
  columns,
  getRowId,
  sort,
  onSortChange,
  onRowClick,
  className,
  emptyState,
}: {
  rows: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  sort?: SortState | undefined;
  onSortChange?: ((sort: SortState) => void) | undefined;
  onRowClick?: ((row: T) => void) | undefined;
  className?: string | undefined;
  emptyState?: ReactNode | undefined;
}) {
  const sorted = applySort(rows, columns, sort);

  const toggle = (col: Column<T>) => {
    if (!col.sortable || !onSortChange) return;
    const direction: "asc" | "desc" =
      sort?.columnId === col.id && sort.direction === "asc" ? "desc" : "asc";
    onSortChange({ columnId: col.id, direction });
  };

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead>
          <tr className="border-border border-b">
            {columns.map((col) => (
              <th
                key={col.id}
                scope="col"
                aria-sort={
                  sort?.columnId === col.id
                    ? sort.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
                className={cn(
                  "text-muted-foreground px-3 py-2 text-left text-[11px] font-medium tracking-wide uppercase",
                  col.hideBelow === "lg" && "hidden lg:table-cell",
                  col.hideBelow === "xl" && "hidden xl:table-cell",
                  col.headerClassName,
                )}
              >
                {col.sortable ? (
                  <button
                    type="button"
                    onClick={() => toggle(col)}
                    className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
                  >
                    {col.header}
                    {sort?.columnId === col.id ? (
                      sort.direction === "asc" ? (
                        <ArrowUp className="size-3" aria-hidden />
                      ) : (
                        <ArrowDown className="size-3" aria-hidden />
                      )
                    ) : (
                      <ChevronsUpDown className="size-3 opacity-40" aria-hidden />
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-0">
                {emptyState}
              </td>
            </tr>
          ) : (
            sorted.map((row) => (
              <tr
                key={getRowId(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-border hover:bg-accent/40 border-b transition-colors last:border-b-0",
                  onRowClick && "cursor-pointer",
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className={cn(
                      "px-3 py-2 align-middle",
                      col.hideBelow === "lg" && "hidden lg:table-cell",
                      col.hideBelow === "xl" && "hidden xl:table-cell",
                      col.className,
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function applySort<T>(
  rows: T[],
  columns: Column<T>[],
  sort: SortState | undefined,
): T[] {
  if (!sort) return rows;
  const col = columns.find((c) => c.id === sort.columnId);
  if (!col?.sortValue) return rows;
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = col.sortValue!(a);
    const bv = col.sortValue!(b);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}
