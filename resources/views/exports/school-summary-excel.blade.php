<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>School Summary Report</title>
</head>
<body>
    <table border="1" cellspacing="0" cellpadding="5">
        <tr>
            <td colspan="9"><strong>CSPAMS School Summary Report</strong></td>
        </tr>
        <tr>
            <td colspan="9">Generated At: {{ $generatedAt }}</td>
        </tr>
        <tr>
            <th>School</th>
            <th>District</th>
            <th>Total Learners</th>
            <th>At-Risk Learners</th>
            <th>Dropped Out</th>
            <th>High Risk</th>
            <th>Dropout Rate (%)</th>
            <th>Performance Submissions</th>
            <th>Latest Submission</th>
        </tr>
        @forelse ($rows as $row)
            <tr>
                <td>{{ $row['school'] ?? '-' }}</td>
                <td>{{ $row['district'] ?? '-' }}</td>
                <td>{{ (int) ($row['total_learners'] ?? 0) }}</td>
                <td>{{ (int) ($row['at_risk'] ?? 0) }}</td>
                <td>{{ (int) ($row['dropped_out'] ?? 0) }}</td>
                <td>{{ (int) ($row['high_risk'] ?? 0) }}</td>
                <td>{{ number_format((float) ($row['dropout_rate'] ?? 0), 2) }}</td>
                <td>{{ (int) ($row['performance_submissions'] ?? 0) }}</td>
                <td>{{ $row['latest_submission'] ?? '-' }}</td>
            </tr>
        @empty
            <tr>
                <td colspan="9">No rows available for current filters.</td>
            </tr>
        @endforelse
    </table>
</body>
</html>
