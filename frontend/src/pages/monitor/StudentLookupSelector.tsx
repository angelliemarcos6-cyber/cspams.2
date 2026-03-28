import { ChevronDown, RefreshCw, Search, X } from "lucide-react";

interface StudentLookupOption {
  id: string;
  lrn: string;
  fullName: string;
  teacherName: string;
  schoolKey: string;
  schoolCode: string;
  schoolName: string;
}

interface StudentLookupSelectorProps {
  dropdownId: string;
  isOpen: boolean;
  rootClassName?: string;
  selectedLabel: string;
  isSyncing: boolean;
  query: string;
  placeholder: string;
  filteredOptions: StudentLookupOption[];
  allOptions: StudentLookupOption[];
  selectedStudentId: string | null;
  onToggle: () => void;
  onQueryChange: (value: string) => void;
  onClearQuery: () => void;
  onClearSelection: () => void;
  onSelectOption: (option: StudentLookupOption) => void;
}

export function StudentLookupSelector({
  dropdownId,
  isOpen,
  rootClassName = "relative mt-3",
  selectedLabel,
  isSyncing,
  query,
  placeholder,
  filteredOptions,
  allOptions,
  selectedStudentId,
  onToggle,
  onQueryChange,
  onClearQuery,
  onClearSelection,
  onSelectOption,
}: StudentLookupSelectorProps) {
  return (
    <div className={rootClassName} data-scope-dropdown-id={dropdownId}>
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex w-full items-center justify-between gap-2 border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs font-semibold text-slate-700 transition hover:border-primary-200 hover:text-primary-700"
      >
        <span className="truncate">{selectedLabel}</span>
        <span className="inline-flex items-center gap-1">
          {isSyncing && <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" />}
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
                  placeholder={placeholder}
                  className="w-full border border-slate-200 bg-white py-1.5 pl-7 pr-7 text-xs text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                />
                {query.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={onClearQuery}
                    aria-label="Clear student search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <span className="shrink-0 text-[10px] font-semibold text-slate-500" title="Matches / total students">
                {filteredOptions.length}/{allOptions.length}
              </span>
            </div>
          </div>
          <div className="relative max-h-72 overflow-y-auto overscroll-contain p-1 pr-1 [scrollbar-gutter:stable]">
            <button
              type="button"
              onClick={onClearSelection}
              className={`block w-full px-2.5 py-1.5 text-left text-xs transition ${
                !selectedStudentId ? "bg-primary-50 text-primary-800" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              All students
            </button>
            {filteredOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onSelectOption(option)}
                className={`block w-full px-2.5 py-1.5 text-left text-xs transition ${
                  selectedStudentId === option.id ? "bg-primary-50 text-primary-800" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="font-semibold">{option.fullName}</span>
                <span className="ml-1 text-slate-500">({option.lrn})</span>
                <span className="ml-1 text-slate-400">
                  {option.schoolCode} - {option.schoolName}
                </span>
              </button>
            ))}
            {filteredOptions.length === 0 && <p className="px-2.5 py-2 text-xs text-slate-500">No results.</p>}
            {allOptions.length > 12 && (
              <div className="pointer-events-none sticky bottom-0 h-5 bg-gradient-to-t from-white to-white/0" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
