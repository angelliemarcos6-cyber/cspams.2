<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Performance Summary Report</title>
</head>
<body>
    <table border="1" cellspacing="0" cellpadding="5">
        <tr>
            <td colspan="7"><strong>CSPAMS Performance Summary Report</strong></td>
        </tr>
        <tr>
            <td colspan="7">Generated At: {{ $generatedAt }}</td>
        </tr>
        <tr>
            <th>School</th>
            <th>Metric</th>
            <th>Period</th>
            <th>Records</th>
            <th>Average Value</th>
            <th>Lowest Value</th>
            <th>Highest Value</th>
        </tr>
        @forelse ($rows as $row)
            <tr>
                <td>{{ $row['school'] ?? '-' }}</td>
                <td>{{ $row['metric'] ?? '-' }}</td>
                <td>{{ $row['period'] ?? '-' }}</td>
                <td>{{ (int) ($row['records'] ?? 0) }}</td>
                <td>{{ number_format((float) ($row['average_value'] ?? 0), 2) }}</td>
                <td>{{ number_format((float) ($row['lowest_value'] ?? 0), 2) }}</td>
                <td>{{ number_format((float) ($row['highest_value'] ?? 0), 2) }}</td>
            </tr>
        @empty
            <tr>
                <td colspan="7">No rows available for current filters.</td>
            </tr>
        @endforelse
    </table>
</body>
</html>
