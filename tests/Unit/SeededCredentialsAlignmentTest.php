<?php

namespace Tests\Unit;

use Database\Seeders\DemoDataSeeder;
use ReflectionMethod;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class SeededCredentialsAlignmentTest extends TestCase
{
    public function test_monitor_seed_helper_matches_demo_data_seeder_default(): void
    {
        $helper = new class
        {
            use InteractsWithSeededCredentials;

            public function monitorPassword(): string
            {
                return $this->demoMonitorPassword();
            }

            public function loginPassword(string $role, string $login): string
            {
                return $this->demoPasswordForLogin($role, $login);
            }
        };

        $seeder = new DemoDataSeeder();
        $monitorPasswordMethod = new ReflectionMethod($seeder, 'demoMonitorPassword');
        $monitorPasswordMethod->setAccessible(true);
        $seederMonitorPassword = $monitorPasswordMethod->invoke($seeder);

        $this->assertSame('Demo@123456', $helper->monitorPassword());
        $this->assertSame($helper->monitorPassword(), $seederMonitorPassword);
        $this->assertSame(
            $helper->monitorPassword(),
            $helper->loginPassword('monitor', 'cspamsmonitor@gmail.com'),
        );
    }
}
