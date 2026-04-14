import { type ReactNode } from "react";
import { CalendarDays, Search, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/utils/cn";

export interface FilterBarOption {
  value: string;
  label: string;
}

interface FilterBarProps {
  className?: string;
  showSearch?: boolean;
  searchValue?: string;
  searchPlaceholder?: string;
  searchParamKey?: string;
  onSearchChange?: (value: string) => void;
  showStatus?: boolean;
  statusLabel?: string;
  statusValue?: string;
  statusParamKey?: string;
  statusOptions?: FilterBarOption[];
  onStatusChange?: (value: string) => void;
  showCategory?: boolean;
  categoryLabel?: string;
  categoryValue?: string;
  categoryParamKey?: string;
  categoryOptions?: FilterBarOption[];
  onCategoryChange?: (value: string) => void;
  showDateRange?: boolean;
  dateFromValue?: string;
  dateToValue?: string;
  dateFromParamKey?: string;
  dateToParamKey?: string;
  onDateFromChange?: (value: string) => void;
  onDateToChange?: (value: string) => void;
  onClearDateRange?: () => void;
  children?: ReactNode;
}

function normalizeParamValue(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized === "all") {
    return "";
  }

  return normalized;
}

export function FilterBar({
  className,
  showSearch = false,
  searchValue = "",
  searchPlaceholder = "Search",
  searchParamKey = "q",
  onSearchChange,
  showStatus = false,
  statusLabel = "Status",
  statusValue = "all",
  statusParamKey = "status",
  statusOptions = [],
  onStatusChange,
  showCategory = false,
  categoryLabel = "Category",
  categoryValue = "all",
  categoryParamKey = "category",
  categoryOptions = [],
  onCategoryChange,
  showDateRange = false,
  dateFromValue = "",
  dateToValue = "",
  dateFromParamKey = "from",
  dateToParamKey = "to",
  onDateFromChange,
  onDateToChange,
  onClearDateRange,
  children,
}: FilterBarProps) {
  const [, setSearchParams] = useSearchParams();

  const updateSearchParam = (key: string, rawValue: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      const normalized = normalizeParamValue(rawValue);

      if (normalized) {
        next.set(key, normalized);
      } else {
        next.delete(key);
      }

      return next;
    }, { replace: true });
  };

  const handleSearchChange = (value: string) => {
    onSearchChange?.(value);
    updateSearchParam(searchParamKey, value);
  };

  const handleStatusChange = (value: string) => {
    onStatusChange?.(value);
    updateSearchParam(statusParamKey, value);
  };

  const handleCategoryChange = (value: string) => {
    onCategoryChange?.(value);
    updateSearchParam(categoryParamKey, value);
  };

  const handleDateFromChange = (value: string) => {
    onDateFromChange?.(value);
    updateSearchParam(dateFromParamKey, value);
  };

  const handleDateToChange = (value: string) => {
    onDateToChange?.(value);
    updateSearchParam(dateToParamKey, value);
  };

  const handleClearDateRange = () => {
    onClearDateRange?.();
    updateSearchParam(dateFromParamKey, "");
    updateSearchParam(dateToParamKey, "");
  };

  return (
    <div className={cn("rounded-sm border border-slate-200 bg-slate-50 p-3", className)}>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {showSearch && (
          <label className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600 shadow-sm">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              value={searchValue}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              className="w-full border-none bg-transparent text-xs font-semibold text-slate-700 outline-none"
            />
          </label>
        )}

        {showStatus && (
          <label className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600 shadow-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{statusLabel}</span>
            <select
              value={statusValue}
              onChange={(event) => handleStatusChange(event.target.value)}
              className="w-full cursor-pointer border-none bg-transparent text-xs font-semibold text-slate-700 outline-none"
            >
              {statusOptions.map((option) => (
                <option key={`filter-status-${option.value}`} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {showCategory && (
          <label className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600 shadow-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{categoryLabel}</span>
            <select
              value={categoryValue}
              onChange={(event) => handleCategoryChange(event.target.value)}
              className="w-full cursor-pointer border-none bg-transparent text-xs font-semibold text-slate-700 outline-none"
            >
              {categoryOptions.map((option) => (
                <option key={`filter-category-${option.value}`} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {showDateRange && (
          <div className="inline-flex w-full items-center gap-2 rounded-sm border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600 shadow-sm">
            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="date"
              value={dateFromValue}
              onChange={(event) => handleDateFromChange(event.target.value)}
              className="min-w-0 flex-1 border-none bg-transparent text-xs font-semibold text-slate-700 outline-none"
            />
            <span className="text-slate-300">-</span>
            <input
              type="date"
              value={dateToValue}
              onChange={(event) => handleDateToChange(event.target.value)}
              className="min-w-0 flex-1 border-none bg-transparent text-xs font-semibold text-slate-700 outline-none"
            />
            {(dateFromValue.trim() || dateToValue.trim()) && (
              <button
                type="button"
                onClick={handleClearDateRange}
                className="ml-auto rounded-sm p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Clear date range"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {children ? <div className="mt-2 border-t border-slate-200 pt-2">{children}</div> : null}
    </div>
  );
}
