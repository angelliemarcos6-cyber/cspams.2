<?php

namespace App\Support\Indicators;

final class SubmissionFileDefinition
{
    /**
     * @var array<string, array{label:string, short_label:string, core:bool}>
     */
    private const DEFINITIONS = [
        'bmef' => [
            'label' => 'BMEF',
            'short_label' => 'BMEF',
            'core' => true,
        ],
        'smea' => [
            'label' => 'SMEA',
            'short_label' => 'SMEA',
            'core' => true,
        ],
        'fm_qad_001' => [
            'label' => 'FM-QAD-001 Qualitative Evaluation Processing Sheet for Establishment of Private School',
            'short_label' => 'FM-QAD-001',
            'core' => false,
        ],
        'fm_qad_002' => [
            'label' => 'FM-QAD-002 Qualitative Evaluation Processing Sheet for Recognition of Private Schools',
            'short_label' => 'FM-QAD-002',
            'core' => false,
        ],
        'fm_qad_003' => [
            'label' => 'FM-QAD-003 Qualitative Evaluation Processing Sheet for Renewal Permit & Government Recognition',
            'short_label' => 'FM-QAD-003',
            'core' => false,
        ],
        'fm_qad_004' => [
            'label' => 'FM-QAD-004 Qualitative Evaluation Processing Sheet for SHS',
            'short_label' => 'FM-QAD-004',
            'core' => false,
        ],
        'fm_qad_008' => [
            'label' => 'FM-QAD-008 Checklist for Application for SPED',
            'short_label' => 'FM-QAD-008',
            'core' => false,
        ],
        'fm_qad_009' => [
            'label' => 'FM-QAD-009 Checklist for Application for the Issuance of Special Order',
            'short_label' => 'FM-QAD-009',
            'core' => false,
        ],
        'fm_qad_010' => [
            'label' => 'FM-QAD-010 Checklist for Application for Tuition Fee Increase',
            'short_label' => 'FM-QAD-010',
            'core' => false,
        ],
        'fm_qad_011' => [
            'label' => 'FM-QAD-011 Processing Sheet for Application for Additional Strand in SHS',
            'short_label' => 'FM-QAD-011',
            'core' => false,
        ],
        'fm_qad_034' => [
            'label' => 'FM-QAD-034 Requirements for the Opening of Science Class',
            'short_label' => 'FM-QAD-034',
            'core' => false,
        ],
        'fm_qad_041' => [
            'label' => 'FM-QAD-041 Request for Confirmation of School Fees',
            'short_label' => 'FM-QAD-041',
            'core' => false,
        ],
    ];

    /**
     * @return array<string, array{label:string, short_label:string, core:bool}>
     */
    public static function definitions(): array
    {
        return self::DEFINITIONS;
    }

    /**
     * @return list<string>
     */
    public static function types(): array
    {
        return array_keys(self::DEFINITIONS);
    }

    public static function isValidType(string $type): bool
    {
        return array_key_exists($type, self::DEFINITIONS);
    }

    public static function isCoreType(string $type): bool
    {
        return (self::DEFINITIONS[$type]['core'] ?? false) === true;
    }

    public static function labelFor(string $type): string
    {
        return self::DEFINITIONS[$type]['label'] ?? strtoupper($type);
    }

    public static function shortLabelFor(string $type): string
    {
        return self::DEFINITIONS[$type]['short_label'] ?? strtoupper($type);
    }
}
