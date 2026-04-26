<?php

namespace App\Support\Indicators;

final class GroupAImetaDefinition
{
    /**
     * Required Group A/I-META completion groups.
     * Each inner array is an OR-group; at least one metric code in the group
     * must have a meaningful value for submit eligibility.
     *
     * @return array<int, list<string>>
     */
    public static function requiredMetricGroups(): array
    {
        return [
            // Legacy SALO or explicit school head metadata.
            ['SALO', 'IMETA_HEAD_NAME'],
            // Core classroom coverage indicator.
            ['PCR_K'],
            // Core WASH coverage indicator.
            ['WASH_RATIO'],
        ];
    }

    /**
     * Flattened unique list of required metric codes.
     *
     * @return list<string>
     */
    public static function requiredMetricCodes(): array
    {
        $codes = [];
        foreach (self::requiredMetricGroups() as $group) {
            foreach ($group as $code) {
                $normalized = strtoupper(trim($code));
                if ($normalized === '') {
                    continue;
                }
                $codes[$normalized] = true;
            }
        }

        return array_keys($codes);
    }
}

