<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Performance Summary Report</title>
    <style>
        body {
            font-family: DejaVu Sans, sans-serif;
            font-size: 11px;
            color: #1f2937;
        }
        h1 {
            margin: 0 0 6px 0;
            font-size: 16px;
        }
        .meta {
            margin-bottom: 10px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            border: 1px solid #d1d5db;
            padding: 5px;
        }
        th {
            background: #f3f4f6;
            text-align: left;
        }
        .right {
            text-align: right;
        }
        .empty {
            text-align: center;
            color: #6b7280;
        }
    </style>
</head>
<body>
    <h1>CSPAMS Performance Summary Report</h1>
    <div class="meta">
        Generated At: {{ $generatedAt }}<br>
        Academic Year ID: {{ $filters->academicYearId }}<br>
        Period: {{ $filters->period ?? 'All Periods' }}<br>
        School Scope: {{ $filters->schoolId ?? 'All Schools' }}
    </div>

    <table>
        <thead>
            <tr>
                <th>School</th>
                <th>Metric</th>
                <th>Period</th>
                <th class="right">Records</th>
                <th class="right">Average Value</th>
                <th class="right">Lowest Value</th>
                <th class="right">Highest Value</th>
            </tr>
        </thead>
        <tbody>
            @forelse ($rows as $row)
                <tr>
                    <td>{{ $row['school'] ?? '-' }}</td>
                    <td>{{ $row['metric'] ?? '-' }}</td>
                    <td>{{ $row['period'] ?? '-' }}</td>
                    <td class="right">{{ number_format((int) ($row['records'] ?? 0)) }}</td>
                    <td class="right">{{ number_format((float) ($row['average_value'] ?? 0), 2) }}</td>
                    <td class="right">{{ number_format((float) ($row['lowest_value'] ?? 0), 2) }}</td>
                    <td class="right">{{ number_format((float) ($row['highest_value'] ?? 0), 2) }}</td>
                </tr>
            @empty
                <tr>
                    <td colspan="7" class="empty">No rows available for current filters.</td>
                </tr>
            @endforelse
        </tbody>
    </table>
</body>
</html>
