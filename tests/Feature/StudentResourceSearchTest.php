<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Filament\Resources\StudentResource;
use App\Models\AcademicYear;
use App\Models\School;
use Filament\Forms\Components\Select;
use Filament\Forms\Form;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use ReflectionMethod;
use Tests\TestCase;

class StudentResourceSearchTest extends TestCase
{
    use RefreshDatabase;

    public function test_case_insensitive_like_operator_matches_driver(): void
    {
        $method = new ReflectionMethod(StudentResource::class, 'caseInsensitiveLikeOperator');
        $method->setAccessible(true);

        $expected = DB::connection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';
        $this->assertSame($expected, $method->invoke(null));
    }

    public function test_school_search_matches_against_lowercase_input(): void
    {
        School::query()->create([
            'name' => 'Central Elementary School',
            'school_code' => 'TEST-CES-001',
            'address' => 'N/A',
            'status' => 'active',
        ]);

        $select = $this->resolveSelect('school_id');
        $callback = $select->getSearchResultsUsing();
        $this->assertNotNull($callback);

        /** @var array<int|string, string> $results */
        $results = $callback('central elementary');

        $this->assertNotEmpty(
            $results,
            'StudentResource school search must match case-insensitively on the active driver.',
        );
        $this->assertContains('Central Elementary School', array_values($results));
    }

    public function test_academic_year_search_matches_against_lowercase_input(): void
    {
        AcademicYear::query()->create([
            'name' => 'AY 2025-2026',
            'is_current' => true,
        ]);

        $select = $this->resolveSelect('academic_year_id');
        $callback = $select->getSearchResultsUsing();
        $this->assertNotNull($callback);

        /** @var array<int|string, string> $results */
        $results = $callback('ay 2025');

        $this->assertNotEmpty($results);
        $this->assertContains('AY 2025-2026', array_values($results));
    }

    private function resolveSelect(string $name): Select
    {
        $form = StudentResource::form(Form::make());

        foreach ($form->getComponents() as $component) {
            if ($component instanceof Select && $component->getName() === $name) {
                return $component;
            }
        }

        $this->fail("Select field '{$name}' not found on StudentResource form.");
    }
}
