<?php

namespace App\Services;

use App\Support\Database\BuildsEscapedLikePatterns;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class FilterService
{
    use BuildsEscapedLikePatterns;

    /**
     * @var list<string>
     */
    private const DEFAULT_FILTER_KEYS = [
        'school_id',
        'academic_year_id',
        'status',
        'category',
        'date_from',
        'date_to',
        'search',
    ];

    /**
     * @var list<string>
     */
    private const DATE_COLUMN_FALLBACKS = [
        'submitted_at',
        'flagged_at',
        'last_status_at',
        'created_at',
        'updated_at',
    ];

    /**
     * @var list<string>
     */
    private const SEARCH_COLUMN_FALLBACKS = [
        'school_code',
        'name',
        'notes',
        'description',
        'reporting_period',
        'grade_level',
        'section',
        'district',
        'address',
        'region',
        'level',
        'type',
    ];

    /**
     * @var array<string, array<string, bool>>
     */
    private array $columnCache = [];

    /**
     * @param array<string, string> $aliases
     * @param list<string> $keys
     *
     * @return array<string, mixed>
     */
    public function extract(Request $request, array $aliases = [], array $keys = self::DEFAULT_FILTER_KEYS): array
    {
        $filters = [];

        foreach ($keys as $filterKey) {
            $requestKey = $aliases[$filterKey] ?? $filterKey;
            if (! $request->has($requestKey)) {
                continue;
            }

            $normalized = $this->normalizeFilterValue($filterKey, $request->input($requestKey));
            if ($normalized === null) {
                continue;
            }

            $filters[$filterKey] = $normalized;
        }

        return $filters;
    }

    /**
     * @param array<string, mixed> $filters
     * @param array{
     *     school_column?: string,
     *     academic_year_column?: string,
     *     status_column?: string,
     *     category_column?: string,
     *     date_column?: string|null,
     *     search_columns?: array<int, string>,
     *     search_relations?: array<string, array<int, string>>
     * } $options
     */
    public function apply(Builder $query, array $filters, array $options = []): Builder
    {
        $table = $query->getModel()->getTable();
        $schoolColumn = $this->normalizeColumnName($options['school_column'] ?? 'school_id');
        $academicYearColumn = $this->normalizeColumnName($options['academic_year_column'] ?? 'academic_year_id');
        $statusColumn = $this->normalizeColumnName($options['status_column'] ?? 'status');
        $categoryColumn = $this->normalizeColumnName($options['category_column'] ?? 'category');

        $schoolId = $this->normalizeNumericFilter($filters['school_id'] ?? null);
        if ($schoolId !== null && $schoolColumn !== null && $this->hasColumn($table, $schoolColumn)) {
            $query->where($schoolColumn, $schoolId);
        }

        $academicYearId = $this->normalizeNumericFilter($filters['academic_year_id'] ?? null);
        if ($academicYearId !== null && $academicYearColumn !== null && $this->hasColumn($table, $academicYearColumn)) {
            $query->where($academicYearColumn, $academicYearId);
        }

        $status = $this->normalizeStringOrListFilter($filters['status'] ?? null);
        if ($status !== null && $statusColumn !== null && $this->hasColumn($table, $statusColumn)) {
            if (is_array($status)) {
                $query->whereIn($statusColumn, $status);
            } else {
                $query->where($statusColumn, $status);
            }
        }

        $category = $this->normalizeStringOrListFilter($filters['category'] ?? null);
        if ($category !== null && $categoryColumn !== null && $this->hasColumn($table, $categoryColumn)) {
            if (is_array($category)) {
                $query->whereIn($categoryColumn, $category);
            } else {
                $query->where($categoryColumn, $category);
            }
        }

        $dateColumn = $this->resolveDateColumn($table, $options['date_column'] ?? null);
        if ($dateColumn !== null) {
            $dateFrom = $this->normalizeDateFilter($filters['date_from'] ?? null);
            if ($dateFrom !== null) {
                $query->whereDate($dateColumn, '>=', $dateFrom);
            }

            $dateTo = $this->normalizeDateFilter($filters['date_to'] ?? null);
            if ($dateTo !== null) {
                $query->whereDate($dateColumn, '<=', $dateTo);
            }
        }

        $search = $this->normalizeSearchFilter($filters['search'] ?? null);
        if ($search !== null) {
            $searchColumns = $this->resolveSearchColumns($table, $options['search_columns'] ?? []);
            $searchRelations = $this->resolveSearchRelations($options['search_relations'] ?? []);

            if ($searchColumns !== [] || $searchRelations !== []) {
                $query->where(function (Builder $builder) use ($search, $searchColumns, $searchRelations): void {
                    $firstPredicate = true;

                    foreach ($searchColumns as $column) {
                        $this->whereLikeContains(
                            $builder,
                            $column,
                            $search,
                            $firstPredicate ? 'and' : 'or',
                        );
                        $firstPredicate = false;
                    }

                    foreach ($searchRelations as $relation => $columns) {
                        if ($columns === []) {
                            continue;
                        }

                        $builder->orWhereHas($relation, function (Builder $relationQuery) use ($columns, $search): void {
                            $firstRelationPredicate = true;
                            foreach ($columns as $column) {
                                $this->whereLikeContains(
                                    $relationQuery,
                                    $column,
                                    $search,
                                    $firstRelationPredicate ? 'and' : 'or',
                                );
                                $firstRelationPredicate = false;
                            }
                        });
                    }
                });
            }
        }

        return $query;
    }

    /**
     * @param array<string, mixed> $filters
     * @param list<string> $keys
     */
    public function buildCacheKey(array $filters, array $keys = self::DEFAULT_FILTER_KEYS): string
    {
        $segments = [];

        foreach ($keys as $key) {
            if (! array_key_exists($key, $filters)) {
                $segments[] = "{$key}:any";
                continue;
            }

            $value = $filters[$key];
            if ($value === null) {
                $segments[] = "{$key}:null";
                continue;
            }

            if (is_array($value)) {
                $normalized = collect($value)
                    ->map(static fn (mixed $entry): string => trim((string) $entry))
                    ->filter(static fn (string $entry): bool => $entry !== '')
                    ->implode(',');

                $segments[] = "{$key}:" . ($normalized !== '' ? $normalized : 'null');
                continue;
            }

            $normalized = trim((string) $value);
            $segments[] = "{$key}:" . ($normalized !== '' ? $normalized : 'null');
        }

        return implode('|', $segments);
    }

    private function hasColumn(string $table, string $column): bool
    {
        if (! isset($this->columnCache[$table])) {
            $this->columnCache[$table] = [];
        }

        if (! array_key_exists($column, $this->columnCache[$table])) {
            $this->columnCache[$table][$column] = Schema::hasColumn($table, $column);
        }

        return $this->columnCache[$table][$column];
    }

    private function normalizeColumnName(mixed $value): ?string
    {
        $normalized = trim((string) $value);
        return $normalized !== '' ? $normalized : null;
    }

    private function normalizeNumericFilter(mixed $value): int|string|null
    {
        if (is_int($value)) {
            return $value > 0 ? $value : null;
        }

        if (is_string($value)) {
            $normalized = trim($value);
            if ($normalized === '') {
                return null;
            }

            if (ctype_digit($normalized)) {
                $integer = (int) $normalized;
                return $integer > 0 ? $integer : null;
            }

            return $normalized;
        }

        if (is_numeric($value)) {
            $integer = (int) $value;
            return $integer > 0 ? $integer : null;
        }

        return null;
    }

    /**
     * @return string|array<int, string>|null
     */
    private function normalizeStringOrListFilter(mixed $value): string|array|null
    {
        if (is_array($value)) {
            $normalized = collect($value)
                ->map(static fn (mixed $entry): string => trim((string) $entry))
                ->filter(static fn (string $entry): bool => $entry !== '')
                ->values()
                ->all();

            return $normalized !== [] ? $normalized : null;
        }

        $normalized = trim((string) $value);
        return $normalized !== '' ? $normalized : null;
    }

    private function normalizeDateFilter(mixed $value): ?string
    {
        $normalized = trim((string) $value);
        if ($normalized === '') {
            return null;
        }

        try {
            return Carbon::parse($normalized)->toDateString();
        } catch (\Throwable) {
            return null;
        }
    }

    private function normalizeSearchFilter(mixed $value): ?string
    {
        $normalized = trim((string) $value);
        return $normalized !== '' ? $normalized : null;
    }

    private function resolveDateColumn(string $table, mixed $preferred): ?string
    {
        if (is_string($preferred) && trim($preferred) !== '') {
            $column = trim($preferred);
            return $this->hasColumn($table, $column) ? $column : null;
        }

        foreach (self::DATE_COLUMN_FALLBACKS as $candidate) {
            if ($this->hasColumn($table, $candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    /**
     * @param array<int, string> $columns
     * @return array<int, string>
     */
    private function resolveSearchColumns(string $table, array $columns): array
    {
        $normalizedColumns = collect($columns)
            ->map(static fn (mixed $column): string => trim((string) $column))
            ->filter(static fn (string $column): bool => $column !== '')
            ->values()
            ->all();

        if ($normalizedColumns === []) {
            $normalizedColumns = self::SEARCH_COLUMN_FALLBACKS;
        }

        return collect($normalizedColumns)
            ->filter(fn (string $column): bool => $this->hasColumn($table, $column))
            ->values()
            ->all();
    }

    /**
     * @param array<string, array<int, string>> $relations
     * @return array<string, array<int, string>>
     */
    private function resolveSearchRelations(array $relations): array
    {
        return collect($relations)
            ->mapWithKeys(static function (mixed $columns, mixed $relation): array {
                if (! is_array($columns)) {
                    return [];
                }

                $relationName = trim((string) $relation);
                if ($relationName === '') {
                    return [];
                }

                $normalizedColumns = collect($columns)
                    ->map(static fn (mixed $column): string => trim((string) $column))
                    ->filter(static fn (string $column): bool => $column !== '')
                    ->values()
                    ->all();

                if ($normalizedColumns === []) {
                    return [];
                }

                return [$relationName => $normalizedColumns];
            })
            ->all();
    }

    private function normalizeFilterValue(string $key, mixed $value): mixed
    {
        if ($key === 'school_id' || $key === 'academic_year_id') {
            return $this->normalizeNumericFilter($value);
        }

        if (in_array($key, ['status', 'category'], true)) {
            return $this->normalizeStringOrListFilter($value);
        }

        if ($key === 'date_from' || $key === 'date_to') {
            return $this->normalizeDateFilter($value);
        }

        if ($key === 'search') {
            return $this->normalizeSearchFilter($value);
        }

        if (is_array($value)) {
            $normalizedArray = collect($value)
                ->map(static fn (mixed $entry): string => trim((string) $entry))
                ->filter(static fn (string $entry): bool => $entry !== '')
                ->values()
                ->all();

            return $normalizedArray !== [] ? $normalizedArray : null;
        }

        $normalized = trim((string) $value);
        return $normalized !== '' ? $normalized : null;
    }
}
