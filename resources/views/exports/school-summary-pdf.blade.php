<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>School Summary Report</title>
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
    <h1>CSPAMS School Summary Report</h1>
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
                <th>District</th>
                <th class="right">Total Learners</th>
                <th class="right">At-Risk Learners</th>
                <th class="right">Dropped Out</th>
                <th class="right">High Risk</th>
                <th class="right">Dropout Rate (%)</th>
                <th class="right">Performance Submissions</th>
                <th>Latest Submission</th>
            </tr>
        </thead>
        <tbody>
            @forelse ($rows as $row)
                <tr>
                    <td>{{ $row['school'] ?? '-' }}</td>
                    <td>{{ $row['district'] ?? '-' }}</td>
                    <td class="right">{{ number_format((int) ($row['total_learners'] ?? 0)) }}</td>
                    <td class="right">{{ number_format((int) ($row['at_risk'] ?? 0)) }}</td>
                    <td class="right">{{ number_format((int) ($row['dropped_out'] ?? 0)) }}</td>
                    <td class="right">{{ number_format((int) ($row['high_risk'] ?? 0)) }}</td>
                    <td class="right">{{ number_format((float) ($row['dropout_rate'] ?? 0), 2) }}</td>
                    <td class="right">{{ number_format((int) ($row['performance_submissions'] ?? 0)) }}</td>
                    <td>{{ $row['latest_submission'] ?? '-' }}</td>
                </tr>
            @empty
                <tr>
                    <td colspan="9" class="empty">No rows available for current filters.</td>
                </tr>
            @endforelse
        </tbody>
    </table>
</body>
</html>
