<x-filament-panels::page>
    <div class="space-y-6">
        <x-filament::section>
            <x-slot name="heading">
                Report Filters
            </x-slot>

            <x-slot name="description">
                Select your reporting scope, then export capstone-ready summaries.
            </x-slot>

            {{ $this->form }}

            <div class="mt-4 flex flex-wrap gap-3">
                <x-filament::button
                    icon="heroicon-o-arrow-down-tray"
                    wire:click="downloadSchoolSummaryCsv"
                >
                    Download School Summary CSV
                </x-filament::button>

                <x-filament::button
                    color="gray"
                    icon="heroicon-o-arrow-down-tray"
                    wire:click="downloadPerformanceSummaryCsv"
                >
                    Download Performance Summary CSV
                </x-filament::button>
            </div>
        </x-filament::section>

        <x-filament::section>
            <x-slot name="heading">
                School Summary Preview
            </x-slot>

            <div class="overflow-x-auto">
                <table class="min-w-full text-sm">
                    <thead class="bg-gray-50 dark:bg-gray-800/60">
                        <tr>
                            <th class="px-3 py-2 text-left font-semibold">School</th>
                            <th class="px-3 py-2 text-left font-semibold">District</th>
                            <th class="px-3 py-2 text-right font-semibold">Learners</th>
                            <th class="px-3 py-2 text-right font-semibold">At-Risk</th>
                            <th class="px-3 py-2 text-right font-semibold">Dropped Out</th>
                            <th class="px-3 py-2 text-right font-semibold">High Risk</th>
                            <th class="px-3 py-2 text-right font-semibold">Dropout %</th>
                            <th class="px-3 py-2 text-right font-semibold">Submissions</th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse ($this->schoolSummaryPreviewRows() as $row)
                            <tr class="border-b border-gray-100 dark:border-gray-800">
                                <td class="px-3 py-2">{{ $row['school'] }}</td>
                                <td class="px-3 py-2">{{ $row['district'] }}</td>
                                <td class="px-3 py-2 text-right">{{ number_format((int) $row['total_learners']) }}</td>
                                <td class="px-3 py-2 text-right">{{ number_format((int) $row['at_risk']) }}</td>
                                <td class="px-3 py-2 text-right">{{ number_format((int) $row['dropped_out']) }}</td>
                                <td class="px-3 py-2 text-right">{{ number_format((int) $row['high_risk']) }}</td>
                                <td class="px-3 py-2 text-right">{{ number_format((float) $row['dropout_rate'], 2) }}</td>
                                <td class="px-3 py-2 text-right">{{ number_format((int) $row['performance_submissions']) }}</td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="8" class="px-3 py-3 text-center text-gray-500">
                                    No rows available for current filters.
                                </td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </x-filament::section>

        <x-filament::section>
            <x-slot name="heading">
                Performance Summary Preview
            </x-slot>

            <div class="overflow-x-auto">
                <table class="min-w-full text-sm">
                    <thead class="bg-gray-50 dark:bg-gray-800/60">
                        <tr>
                            <th class="px-3 py-2 text-left font-semibold">School</th>
                            <th class="px-3 py-2 text-left font-semibold">Metric</th>
                            <th class="px-3 py-2 text-left font-semibold">Period</th>
                            <th class="px-3 py-2 text-right font-semibold">Records</th>
                            <th class="px-3 py-2 text-right font-semibold">Average</th>
                            <th class="px-3 py-2 text-right font-semibold">Lowest</th>
                            <th class="px-3 py-2 text-right font-semibold">Highest</th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse ($this->performanceSummaryPreviewRows() as $row)
                            <tr class="border-b border-gray-100 dark:border-gray-800">
                                <td class="px-3 py-2">{{ $row['school'] }}</td>
                                <td class="px-3 py-2">{{ $row['metric'] }}</td>
                                <td class="px-3 py-2">{{ $row['period'] }}</td>
                                <td class="px-3 py-2 text-right">{{ number_format((int) $row['records']) }}</td>
                                <td class="px-3 py-2 text-right">{{ number_format((float) $row['average_value'], 2) }}</td>
                                <td class="px-3 py-2 text-right">{{ number_format((float) $row['lowest_value'], 2) }}</td>
                                <td class="px-3 py-2 text-right">{{ number_format((float) $row['highest_value'], 2) }}</td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="7" class="px-3 py-3 text-center text-gray-500">
                                    No rows available for current filters.
                                </td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </x-filament::section>
    </div>
</x-filament-panels::page>
