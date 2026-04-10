<?php

namespace Tests\Unit;

use App\Http\Controllers\Api\SchoolHeadAccountController;
use App\Support\Auth\MonitorActionVerificationService;
use App\Support\Auth\SchoolHeadAccountLifecycleService;
use App\Support\Auth\SchoolHeadAccountSetupService;
use Illuminate\Database\QueryException;
use PDOException;
use ReflectionMethod;
use Tests\TestCase;

class SchoolHeadAccountControllerUniqueConstraintTest extends TestCase
{
    public function test_unique_constraint_detection_handles_postgresql_duplicate_key_errors(): void
    {
        $controller = new SchoolHeadAccountController(
            $this->createMock(SchoolHeadAccountLifecycleService::class),
            $this->createMock(SchoolHeadAccountSetupService::class),
            $this->createMock(MonitorActionVerificationService::class),
        );

        $exception = $this->makeQueryException(
            'SQLSTATE[23505]: Unique violation: 7 ERROR: duplicate key value violates unique constraint "users_school_id_unique"',
            23505,
            ['23505', null, 'duplicate key value violates unique constraint'],
        );

        $this->assertTrue($this->detectsUniqueConstraintViolation($controller, $exception));
    }

    public function test_unique_constraint_detection_does_not_treat_generic_foreign_key_errors_as_duplicates(): void
    {
        $controller = new SchoolHeadAccountController(
            $this->createMock(SchoolHeadAccountLifecycleService::class),
            $this->createMock(SchoolHeadAccountSetupService::class),
            $this->createMock(MonitorActionVerificationService::class),
        );

        $exception = $this->makeQueryException(
            'SQLSTATE[23000]: Integrity constraint violation: 1452 Cannot add or update a child row: a foreign key constraint fails',
            23000,
            ['23000', 1452, 'Cannot add or update a child row: a foreign key constraint fails'],
        );

        $this->assertFalse($this->detectsUniqueConstraintViolation($controller, $exception));
    }

    private function makeQueryException(string $message, int $code, array $errorInfo): QueryException
    {
        $previous = new PDOException($message, $code);
        $previous->errorInfo = $errorInfo;

        return new QueryException('testing', 'insert into users ...', [], $previous);
    }

    private function detectsUniqueConstraintViolation(
        SchoolHeadAccountController $controller,
        QueryException $exception,
    ): bool {
        $method = new ReflectionMethod(SchoolHeadAccountController::class, 'isUniqueConstraintViolation');
        $method->setAccessible(true);

        return (bool) $method->invoke($controller, $exception);
    }
}
