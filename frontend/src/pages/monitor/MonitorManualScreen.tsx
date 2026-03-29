import {
  MONITOR_MANUAL_STATUS_GUIDE,
  MONITOR_NAVIGATOR_MANUAL,
} from "@/pages/monitor/monitorDashboardConfig";

interface MonitorManualScreenProps {
  onClose: () => void;
}

export function MonitorManualScreen({ onClose }: MonitorManualScreenProps) {
  return (
    <section
      id="monitor-user-manual"
      className="dashboard-shell mb-5 animate-fade-slide overflow-hidden rounded-sm border border-slate-200 bg-white"
    >
      <div className="min-h-[72vh] p-4 md:p-6 xl:p-8">
        <div className="mx-auto flex h-full w-full max-w-6xl flex-col justify-center gap-6">
          <header className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-700">
              Division Monitor Dashboard
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900 md:text-3xl">User Manual</h2>
            <p className="mx-auto mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
              This guide appears in the main workspace so monitors can review process steps clearly before
              working on live data.
            </p>
          </header>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <article className="rounded-sm border border-slate-200 bg-slate-50 p-4 md:p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-700">Step-by-step Workflow</p>
              <ol className="mt-3 space-y-3">
                {MONITOR_NAVIGATOR_MANUAL.map((step, index) => (
                  <li key={step.id} className="rounded-sm border border-slate-200 bg-white p-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-sm bg-primary-100 text-xs font-bold text-primary-700">
                        {index + 1}
                      </span>
                      {step.title}
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-700">{step.objective}</p>
                    <ul className="mt-2 space-y-1">
                      {step.actions.map((action) => (
                        <li key={`${step.id}-${action}`} className="ml-5 list-disc text-sm text-slate-700">
                          {action}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-sm font-semibold text-primary-700">Done when: {step.doneWhen}</p>
                  </li>
                ))}
              </ol>
            </article>

            <aside className="space-y-4">
              <article className="rounded-sm border border-slate-200 bg-white p-4 md:p-5">
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-700">Workflow Status Guide</p>
                <ul className="mt-3 space-y-2">
                  {MONITOR_MANUAL_STATUS_GUIDE.map((item) => (
                    <li key={item} className="ml-5 list-disc text-sm text-slate-700">
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
              <article className="rounded-sm border border-primary-200 bg-primary-50 p-4 md:p-5">
                <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Quick Reminders</p>
                <ul className="mt-3 space-y-2">
                  <li className="ml-5 list-disc text-sm text-primary-700">
                    Review urgent schools first before routine checks.
                  </li>
                  <li className="ml-5 list-disc text-sm text-primary-700">
                    Write clear return notes to reduce repeated revisions.
                  </li>
                  <li className="ml-5 list-disc text-sm text-primary-700">
                    Use school and learner filters before sending reminders.
                  </li>
                </ul>
              </article>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Return to Dashboard Data
              </button>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
