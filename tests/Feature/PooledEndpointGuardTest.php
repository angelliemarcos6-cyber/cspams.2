<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Providers\AppServiceProvider;
use ReflectionMethod;
use RuntimeException;
use Tests\TestCase;

class PooledEndpointGuardTest extends TestCase
{
    public function test_boot_throws_when_neon_pooled_endpoint_used_in_production(): void
    {
        $this->app->detectEnvironment(static fn (): string => 'production');
        config()->set('database.default', 'pgsql');
        config()->set('database.connections.pgsql.host', 'ep-cool-feather-pooler.us-east-2.aws.neon.tech');
        $_ENV['CSPAMS_ALLOW_NEON_POOLED_ENDPOINT'] = 'false';
        putenv('CSPAMS_ALLOW_NEON_POOLED_ENDPOINT=false');

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Neon pooled endpoint detected');

        $this->invokeGuard();
    }

    public function test_boot_allows_pooled_endpoint_when_override_is_set(): void
    {
        $this->app->detectEnvironment(static fn (): string => 'production');
        config()->set('database.default', 'pgsql');
        config()->set('database.connections.pgsql.host', 'ep-cool-feather-pooler.us-east-2.aws.neon.tech');
        $_ENV['CSPAMS_ALLOW_NEON_POOLED_ENDPOINT'] = 'true';
        putenv('CSPAMS_ALLOW_NEON_POOLED_ENDPOINT=true');

        $this->invokeGuard();

        $this->assertTrue(true, 'Pooled endpoint guard must respect the explicit override flag.');

        putenv('CSPAMS_ALLOW_NEON_POOLED_ENDPOINT');
        unset($_ENV['CSPAMS_ALLOW_NEON_POOLED_ENDPOINT']);
    }

    public function test_boot_passes_for_direct_neon_endpoint(): void
    {
        $this->app->detectEnvironment(static fn (): string => 'production');
        config()->set('database.default', 'pgsql');
        config()->set('database.connections.pgsql.host', 'ep-cool-feather.us-east-2.aws.neon.tech');

        $this->invokeGuard();

        $this->assertTrue(true, 'Direct Neon endpoint must boot without raising.');
    }

    public function test_boot_skips_guard_when_using_sqlite(): void
    {
        $this->app->detectEnvironment(static fn (): string => 'production');
        config()->set('database.default', 'sqlite');

        $this->invokeGuard();

        $this->assertTrue(true);
    }

    public function test_boot_skips_guard_outside_production(): void
    {
        $this->app->detectEnvironment(static fn (): string => 'local');
        config()->set('database.default', 'pgsql');
        config()->set('database.connections.pgsql.host', 'ep-cool-feather-pooler.us-east-2.aws.neon.tech');

        $this->invokeGuard();

        $this->assertTrue(true);
    }

    private function invokeGuard(): void
    {
        $provider = new AppServiceProvider($this->app);
        $method = new ReflectionMethod($provider, 'assertSafeNeonEndpoint');
        $method->setAccessible(true);
        $method->invoke($provider);
    }
}
