<?php

namespace App\Traits;

use App\Services\FilterService;
use Illuminate\Database\Eloquent\Builder;

trait Filterable
{
    public function scopeFilter(Builder $query, array $filters = []): Builder
    {
        return app(FilterService::class)->apply($query, $filters, $this->filterableOptions());
    }

    /**
     * @return array{
     *     school_column: string,
     *     academic_year_column: string,
     *     status_column: string,
     *     category_column: string,
     *     date_column: string|null,
     *     search_columns: array<int, string>,
     *     search_relations: array<string, array<int, string>>
     * }
     */
    protected function filterableOptions(): array
    {
        $searchColumns = [];
        if (property_exists($this, 'filterableSearchColumns') && is_array($this->filterableSearchColumns)) {
            $searchColumns = $this->filterableSearchColumns;
        }

        $searchRelations = [];
        if (property_exists($this, 'filterableSearchRelations') && is_array($this->filterableSearchRelations)) {
            $searchRelations = $this->filterableSearchRelations;
        }

        return [
            'school_column' => property_exists($this, 'filterableSchoolColumn')
                ? (string) $this->filterableSchoolColumn
                : 'school_id',
            'academic_year_column' => property_exists($this, 'filterableAcademicYearColumn')
                ? (string) $this->filterableAcademicYearColumn
                : 'academic_year_id',
            'status_column' => property_exists($this, 'filterableStatusColumn')
                ? (string) $this->filterableStatusColumn
                : 'status',
            'category_column' => property_exists($this, 'filterableCategoryColumn')
                ? (string) $this->filterableCategoryColumn
                : 'category',
            'date_column' => property_exists($this, 'filterableDateColumn')
                ? (is_string($this->filterableDateColumn) ? $this->filterableDateColumn : null)
                : null,
            'search_columns' => array_values(array_filter(
                array_map(static fn (mixed $column): string => trim((string) $column), $searchColumns),
                static fn (string $column): bool => $column !== '',
            )),
            'search_relations' => collect($searchRelations)
                ->mapWithKeys(static function (mixed $columns, mixed $relation): array {
                    if (! is_array($columns)) {
                        return [];
                    }

                    $normalizedColumns = array_values(array_filter(
                        array_map(static fn (mixed $column): string => trim((string) $column), $columns),
                        static fn (string $column): bool => $column !== '',
                    ));

                    $relationName = trim((string) $relation);
                    if ($relationName === '' || $normalizedColumns === []) {
                        return [];
                    }

                    return [$relationName => $normalizedColumns];
                })
                ->all(),
        ];
    }
}
