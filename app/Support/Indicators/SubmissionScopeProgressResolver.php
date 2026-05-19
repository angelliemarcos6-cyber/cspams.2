<?php

namespace App\Support\Indicators;

use App\Models\FormSubmissionHistory;
use App\Models\IndicatorSubmission;
use App\Models\IndicatorSubmissionItem;
use App\Models\PerformanceMetric;
use App\Support\Domain\FormSubmissionStatus;
use App\Support\Domain\MetricDataType;

final class SubmissionScopeProgressResolver
{
    /**
     * @return list<string>
     */
    public function requiredScopeIdsForSubmission(IndicatorSubmission $submission): array
    {
        return [
            GroupBWorkspaceDefinition::SCHOOL_ACHIEVEMENTS,
            GroupBWorkspaceDefinition::KEY_PERFORMANCE,
            ...app(SubmissionFileRequirementResolver::class)->requiredTypesForSubmission($submission),
        ];
    }

    public function scopeLabel(string $scopeId): string
    {
        if (SubmissionFileDefinition::isValidType($scopeId)) {
            return SubmissionFileDefinition::shortLabelFor($scopeId) . ' file';
        }

        return match ($scopeId) {
            GroupBWorkspaceDefinition::SCHOOL_ACHIEVEMENTS => 'School Achievements section',
            GroupBWorkspaceDefinition::KEY_PERFORMANCE => 'Key Performance section',
            default => 'Workspace scope',
        };
    }

    /**
     * @param list<string> $scopeIds
     * @return list<string>
     */
    public function missingRequirementLabelsForScopes(IndicatorSubmission $submission, array $scopeIds): array
    {
        $normalizedScopeIds = $this->normalizeScopeIds($submission, $scopeIds);
        $missing = [];

        foreach ($normalizedScopeIds as $scopeId) {
            if (! $this->isScopeComplete($submission, $scopeId)) {
                $missing[] = $this->scopeLabel($scopeId);
            }
        }

        return $missing;
    }

    public function isScopeComplete(IndicatorSubmission $submission, string $scopeId): bool
    {
        if (SubmissionFileDefinition::isValidType($scopeId)) {
            return $submission->hasSubmissionFileType($scopeId);
        }

        if (! GroupBWorkspaceDefinition::isMetricWorkspace($scopeId)) {
            return false;
        }

        return $this->isMetricWorkspaceComplete($submission, $scopeId);
    }

    /**
     * @return array{
     *   requiredScopeIds:list<string>,
     *   submittedScopeIds:list<string>,
     *   pendingScopeIds:list<string>,
     *   submittedRequiredScopeCount:int,
     *   totalRequiredScopeCount:int
     * }
     */
    public function buildScopeProgressForSubmission(IndicatorSubmission $submission): array
    {
        $requiredScopeIds = $this->requiredScopeIdsForSubmission($submission);
        $submittedScopeIds = $this->submittedScopeIdsForSubmission($submission);
        $requiredScopeSet = array_flip($requiredScopeIds);
        $submittedRequiredScopeIds = array_values(array_filter(
            $submittedScopeIds,
            static fn (string $scopeId): bool => isset($requiredScopeSet[$scopeId]),
        ));

        return [
            'requiredScopeIds' => $requiredScopeIds,
            'submittedScopeIds' => $submittedRequiredScopeIds,
            'pendingScopeIds' => array_values(array_filter(
                $requiredScopeIds,
                static fn (string $scopeId): bool => ! in_array($scopeId, $submittedRequiredScopeIds, true),
            )),
            'submittedRequiredScopeCount' => count($submittedRequiredScopeIds),
            'totalRequiredScopeCount' => count($requiredScopeIds),
        ];
    }

    /**
     * @param list<string> $scopeIds
     * @return list<string>
     */
    public function normalizeScopeIds(IndicatorSubmission $submission, array $scopeIds): array
    {
        $allowed = array_flip($this->requiredScopeIdsForSubmission($submission));
        $normalized = [];

        foreach ($scopeIds as $scopeId) {
            $normalizedScopeId = strtolower(trim((string) $scopeId));
            if ($normalizedScopeId === '' || ! isset($allowed[$normalizedScopeId])) {
                continue;
            }
            if (! in_array($normalizedScopeId, $normalized, true)) {
                $normalized[] = $normalizedScopeId;
            }
        }

        return $normalized;
    }

    /**
     * @return list<string>
     */
    private function submittedScopeIdsForSubmission(IndicatorSubmission $submission): array
    {
        $requiredScopeIds = $this->requiredScopeIdsForSubmission($submission);
        $requiredScopeSet = array_flip($requiredScopeIds);

        $status = $submission->status instanceof FormSubmissionStatus
            ? $submission->status->value
            : strtolower(trim((string) $submission->status));

        if (in_array($status, [
            FormSubmissionStatus::SUBMITTED->value,
            FormSubmissionStatus::VALIDATED->value,
        ], true)) {
            return $requiredScopeIds;
        }

        $submittedScopeSet = [];
        $histories = FormSubmissionHistory::query()
            ->where('form_type', IndicatorSubmission::FORM_TYPE)
            ->where('submission_id', $submission->id)
            ->orderBy('created_at')
            ->orderBy('id')
            ->get(['action', 'to_status', 'metadata']);

        foreach ($histories as $history) {
            $toStatus = strtolower(trim((string) ($history->to_status ?? '')));
            if ($toStatus === FormSubmissionStatus::RETURNED->value) {
                $submittedScopeSet = [];
                continue;
            }

            if (in_array($toStatus, [
                FormSubmissionStatus::SUBMITTED->value,
                FormSubmissionStatus::VALIDATED->value,
            ], true)) {
                $submittedScopeSet = $requiredScopeSet;
                continue;
            }

            $metadata = is_array($history->metadata) ? $history->metadata : [];
            $action = strtolower(trim((string) $history->action));

            if ($action === 'scope_submitted') {
                foreach ($this->extractScopeIdsFromMetadata($submission, $metadata) as $scopeId) {
                    $submittedScopeSet[$scopeId] = true;
                }
                continue;
            }

            foreach ($this->touchedScopeIdsForHistoryAction($submission, $action, $metadata) as $scopeId) {
                unset($submittedScopeSet[$scopeId]);
            }
        }

        return array_values(array_keys($submittedScopeSet));
    }

    /**
     * @return list<string>
     */
    private function touchedScopeIdsForHistoryAction(IndicatorSubmission $submission, string $action, array $metadata): array
    {
        $scopes = $this->extractScopeIdsFromMetadata($submission, $metadata);
        if ($scopes !== []) {
            return $scopes;
        }

        if (str_ends_with($action, '_uploaded')) {
            $type = strtolower(trim((string) ($metadata['type'] ?? '')));
            return SubmissionFileDefinition::isValidType($type) ? [$type] : [];
        }

        if (str_ends_with($action, '_reset')) {
            $workspace = strtolower(trim((string) ($metadata['workspace'] ?? '')));
            return $this->normalizeScopeIds($submission, [$workspace]);
        }

        return [];
    }

    /**
     * @return list<string>
     */
    private function extractScopeIdsFromMetadata(IndicatorSubmission $submission, array $metadata): array
    {
        $raw = $metadata['targets'] ?? $metadata['touchedScopes'] ?? null;
        if (! is_array($raw)) {
            return [];
        }

        return $this->normalizeScopeIds($submission, array_map(
            static fn (mixed $value): string => (string) $value,
            $raw,
        ));
    }

    private function isMetricWorkspaceComplete(IndicatorSubmission $submission, string $workspace): bool
    {
        $requiredMetricCodes = GroupBWorkspaceDefinition::metricCodesFor($workspace);
        if ($requiredMetricCodes === []) {
            return false;
        }

        $submission->loadMissing(['academicYear:id,name', 'items.metric:id,code,data_type,input_schema']);
        $selectedSchoolYear = trim((string) ($submission->academicYear?->name ?? ''));
        if ($selectedSchoolYear === '') {
            return false;
        }

        $itemsByCode = [];
        foreach ($submission->items as $item) {
            $code = strtoupper(trim((string) ($item->metric?->code ?? '')));
            if ($code !== '') {
                $itemsByCode[$code] = $item;
            }
        }

        foreach ($requiredMetricCodes as $metricCode) {
            $item = $itemsByCode[strtoupper(trim($metricCode))] ?? null;
            if (! $item || ! $this->itemIsCompleteForWorkspace($item, $workspace, $selectedSchoolYear)) {
                return false;
            }
        }

        return true;
    }

    private function itemIsCompleteForWorkspace(
        IndicatorSubmissionItem $item,
        string $workspace,
        string $selectedSchoolYear,
    ): bool {
        $metric = $item->metric;
        if (! $metric) {
            return false;
        }

        $dataType = $metric->data_type instanceof MetricDataType
            ? $metric->data_type->value
            : (string) $metric->data_type;
        $schema = is_array($metric->input_schema) ? $metric->input_schema : [];
        $scopedYears = $this->metricYearsInScope($schema, [$selectedSchoolYear]);
        $requiredYears = $scopedYears !== [] ? $scopedYears : [$selectedSchoolYear];
        $requiresTargetActual = $workspace === GroupBWorkspaceDefinition::KEY_PERFORMANCE;

        if ($dataType === MetricDataType::YEARLY_MATRIX->value) {
            return $this->yearlyMatrixItemIsComplete($item, $requiredYears, $requiresTargetActual);
        }

        if ($requiresTargetActual) {
            return $this->typedValueHasMeaningfulContent($item->target_typed_value)
                && $this->typedValueHasMeaningfulContent($item->actual_typed_value);
        }

        return $this->typedValueHasMeaningfulContent($item->actual_typed_value)
            || $this->scalarFieldHasMeaningfulContent($item->actual_display)
            || $item->actual_value !== null;
    }

    /**
     * @param array<string, mixed> $schema
     * @param list<string> $scopeYears
     * @return list<string>
     */
    private function metricYearsInScope(array $schema, array $scopeYears): array
    {
        $schemaYears = array_values(array_filter(
            array_map(static fn (mixed $year): string => trim((string) $year), (array) ($schema['years'] ?? [])),
            static fn (string $year): bool => $year !== '',
        ));

        if ($schemaYears === []) {
            return $scopeYears;
        }

        $scoped = array_values(array_filter(
            $schemaYears,
            static fn (string $year): bool => in_array($year, $scopeYears, true),
        ));

        return $scoped !== [] ? $scoped : $scopeYears;
    }

    /**
     * @param list<string> $requiredYears
     */
    private function yearlyMatrixItemIsComplete(
        IndicatorSubmissionItem $item,
        array $requiredYears,
        bool $requiresTargetActual,
    ): bool {
        $targetValues = is_array($item->target_typed_value['values'] ?? null)
            ? $item->target_typed_value['values']
            : [];
        $actualValues = is_array($item->actual_typed_value['values'] ?? null)
            ? $item->actual_typed_value['values']
            : [];

        foreach ($requiredYears as $year) {
            $actualValue = $actualValues[$year] ?? null;
            if (! $this->scalarFieldHasMeaningfulContent($actualValue)) {
                return false;
            }

            if ($requiresTargetActual) {
                $targetValue = $targetValues[$year] ?? null;
                if (! $this->scalarFieldHasMeaningfulContent($targetValue)) {
                    return false;
                }
            }
        }

        return true;
    }

    private function typedValueHasMeaningfulContent(mixed $typedValue): bool
    {
        if (! is_array($typedValue)) {
            return false;
        }

        if (array_key_exists('values', $typedValue) && is_array($typedValue['values'])) {
            foreach ($typedValue['values'] as $value) {
                if ($this->scalarFieldHasMeaningfulContent($value)) {
                    return true;
                }
            }
        }

        foreach (['value', 'amount', 'currency'] as $key) {
            if (array_key_exists($key, $typedValue) && $this->scalarFieldHasMeaningfulContent($typedValue[$key])) {
                return true;
            }
        }

        return false;
    }

    private function scalarFieldHasMeaningfulContent(mixed $value): bool
    {
        if (is_string($value)) {
            return trim($value) !== '';
        }

        if (is_numeric($value) || is_bool($value)) {
            return true;
        }

        return $value !== null;
    }
}
