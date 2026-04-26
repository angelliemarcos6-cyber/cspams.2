<?php

namespace App\Support\Indicators;

final class GroupBWorkspaceDefinition
{
    public const BMEF = 'bmef';

    public const SMEA = 'smea';

    public const SCHOOL_ACHIEVEMENTS = 'school_achievements_learning_outcomes';

    public const KEY_PERFORMANCE = 'key_performance_indicators';

    /**
     * @var array<string, list<string>>
     */
    private const METRIC_CODES_BY_WORKSPACE = [
        self::SCHOOL_ACHIEVEMENTS => [
            'IMETA_HEAD_NAME',
            'IMETA_ENROLL_TOTAL',
            'IMETA_SBM_LEVEL',
            'PCR_K',
            'PCR_G1_3',
            'PCR_G4_6',
            'PCR_G7_10',
            'PCR_G11_12',
            'WASH_RATIO',
            'COMFORT_ROOMS',
            'TOILET_BOWLS',
            'URINALS',
            'HANDWASH_FAC',
            'LEARNING_MAT_RATIO',
            'PSR_OVERALL',
            'PSR_K',
            'PSR_G1_6',
            'PSR_G7_10',
            'PSR_G11_12',
            'ICT_RATIO',
            'ICT_LAB',
            'SCIENCE_LAB',
            'INTERNET_ACCESS',
            'ELECTRICITY',
            'FENCE_STATUS',
            'TEACHERS_TOTAL',
            'TEACHERS_MALE',
            'TEACHERS_FEMALE',
            'TEACHERS_PWD_TOTAL',
            'TEACHERS_PWD_MALE',
            'TEACHERS_PWD_FEMALE',
            'FUNCTIONAL_SGC',
            'FEEDING_BENEFICIARIES',
            'CANTEEN_INCOME',
            'TEACHER_COOP_INCOME',
            'SAFETY_PLAN',
            'SAFETY_EARTHQUAKE',
            'SAFETY_TYPHOON',
            'SAFETY_COVID',
            'SAFETY_POWER',
            'SAFETY_IN_PERSON',
            'TEACHERS_PFA',
            'TEACHERS_OCC_FIRST_AID',
        ],
        self::KEY_PERFORMANCE => [
            'NER',
            'RR',
            'DR',
            'TR',
            'NIR',
            'PR',
            'ALS_COMPLETER_PCT',
            'GPI',
            'IQR',
            'CR',
            'CSR',
            'PLM_NEARLY_PROF',
            'PLM_PROF',
            'PLM_HIGH_PROF',
            'AE_PASS_RATE',
            'VIOLENCE_REPORT_RATE',
            'LEARNER_SATISFACTION',
            'RIGHTS_AWARENESS',
            'RBE_MANIFEST',
        ],
    ];

    /**
     * @return list<string>
     */
    public static function resetTargets(): array
    {
        return [
            self::BMEF,
            self::SMEA,
            self::SCHOOL_ACHIEVEMENTS,
            self::KEY_PERFORMANCE,
        ];
    }

    /**
     * @return list<string>
     */
    public static function metricCodesFor(string $workspace): array
    {
        return self::METRIC_CODES_BY_WORKSPACE[$workspace] ?? [];
    }

    public static function isMetricWorkspace(string $workspace): bool
    {
        return array_key_exists($workspace, self::METRIC_CODES_BY_WORKSPACE);
    }

    public static function historyActionFor(string $workspace): string
    {
        return match ($workspace) {
            self::BMEF => 'bmef_reset',
            self::SMEA => 'smea_reset',
            self::SCHOOL_ACHIEVEMENTS => 'school_achievements_reset',
            self::KEY_PERFORMANCE => 'key_performance_reset',
            default => 'workspace_reset',
        };
    }
}
