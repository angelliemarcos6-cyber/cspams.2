<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('students', function (Blueprint $table): void {
            $table->string('archived_original_lrn', 20)->nullable()->after('lrn');
        });

        $archivedStudents = DB::table('students')
            ->whereNotNull('deleted_at')
            ->orderBy('id')
            ->get(['id', 'lrn', 'archived_original_lrn', 'deleted_at']);

        foreach ($archivedStudents as $student) {
            $originalLrn = trim((string) ($student->archived_original_lrn ?: $student->lrn));
            if ($originalLrn === '') {
                continue;
            }

            DB::table('students')
                ->where('id', $student->id)
                ->update([
                    'archived_original_lrn' => $originalLrn,
                    'lrn' => $this->archivedPlaceholder(
                        (int) $student->id,
                        (string) $student->deleted_at,
                        $originalLrn,
                    ),
                ]);
        }
    }

    public function down(): void
    {
        Schema::table('students', function (Blueprint $table): void {
            $table->dropColumn('archived_original_lrn');
        });
    }

    private function archivedPlaceholder(int $studentId, string $deletedAt, string $originalLrn): string
    {
        return 'AR' . strtoupper(substr(
            sha1(implode('|', [$studentId, $deletedAt, $originalLrn])),
            0,
            18,
        ));
    }
};
