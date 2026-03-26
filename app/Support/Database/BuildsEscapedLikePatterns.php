<?php

namespace App\Support\Database;

use Illuminate\Database\Eloquent\Builder;

trait BuildsEscapedLikePatterns
{
    protected function containsEscapedLikePattern(string $value): string
    {
        return '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value) . '%';
    }

    protected function whereLikeContains(
        Builder $builder,
        string $column,
        string $value,
        string $boolean = 'and',
    ): Builder {
        $wrappedColumn = $builder->getQuery()->getGrammar()->wrap($column);

        return $builder->whereRaw(
            "{$wrappedColumn} LIKE ? ESCAPE '\\'",
            [$this->containsEscapedLikePattern($value)],
            $boolean,
        );
    }
}
