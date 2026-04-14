import { ChevronDown, RefreshCw, Search, X } from "lucide-react";

interface SchoolScopeOption {
  key: string;
  code: string;
  name: string;
  headName: string;
  headEmail: string;
  searchText: string;
}

interface SchoolScopeSelectorProps {
  dropdownId: string;
  isOpen: boolean;
  rootClassName?: string;
  isLoading: boolean;
  query: string;
  selectedScope: SchoolScopeOption | null;
  filteredOptions: SchoolScopeOption[];
  allOptions: SchoolScopeOption[];
  onToggle: () => void;
  onQueryChange: (value: string) => void;
  onClearQuery: () => void;
  onSelectAll: () => void;
  onSelectOption: (option: SchoolScopeOption) => void;
}

export function SchoolScopeSelector({
  dropdownId,
  isOpen,
  rootClassName = "relative mt-3",
  isLoading,
  query,
  selectedScope,
  filteredOptions,
  allOptions,
  onToggle,
  onQueryChange,
  onClearQuery,
  onSelectAll,
  onSelectOption,
}: SchoolScopeSelectorProps) {
  return (
    <div className={rootClassName} data-scope-dropdown-id={dropdownId}>
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex w-full items-center justify-between gap-2 border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs font-semibold text-slate-700 transition hover:border-primary-200 hover:text-primary-700"
      >
        <span className="truncate">
          {selectedScope ? `${selectedScope.code} - ${selectedScope.name}` : "All schools"}
        </span>
        <span className="inline-flex items-center gap-1">
          {isLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" />}
          <ChevronDown className={`h-3.5 w-3.5 transition ${isOpen ? "rotate-180" : ""}`} />
        </span>
      </button>
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-[80] mt-1 overflow-hidden rounded-sm border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 p-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => onQueryChange(event.target.value)}
                  placeholder="Search schools"
                  className="w-full border border-slate-200 bg-white py-1.5 pl-7 pr-7 text-xs text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                />
                {query.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={onClearQuery}
                    aria-label="Clear school search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <span className="shrink-0 text-[10px] font-semibold text-slate-500" title="Matches / total schools">
                {filteredOptions.length}/{allOptions.length}
              </span>
            </div>
          </div>
          <div className="relative max-h-72 overflow-y-auto overscroll-contain p-1 pr-1 [scrollbar-gutter:stable]">
            {allOptions.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-slate-500">{isLoading ? "Loading schools..." : "No schools."}</p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onSelectAll}
                  className={`block w-full px-2.5 py-1.5 text-left text-xs transition ${
                    !selectedScope ? "bg-primary-50 text-primary-800" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  All schools
                </button>
                {filteredOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    title={`${option.code} - ${option.name}${option.headName ? ` • ${option.headName}` : ""}`}
                    onClick={() => onSelectOption(option)}
                    className={`block w-full px-2.5 py-1.5 text-left text-xs transition ${
                      selectedScope?.key === option.key
                        ? "bg-primary-50 text-primary-800"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">
                        <span className="font-semibold">{option.code}</span> - {option.name}
                      </span>
                      {(option.headName || option.headEmail) && (
                        <span className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
                          {option.headName || option.headEmail}
                          {option.headName && option.headEmail ? ` • ${option.headEmail}` : ""}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
                {filteredOptions.length === 0 && (
                  <p className="px-2.5 py-2 text-xs text-slate-500">No matching school.</p>
                )}
              </>
            )}
            {allOptions.length > 12 && (
              <div className="pointer-events-none sticky bottom-0 h-5 bg-gradient-to-t from-white to-white/0" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
