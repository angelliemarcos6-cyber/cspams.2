<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

class BroadcastingCorsTest extends TestCase
{
    public function test_cors_paths_include_broadcasting_auth(): void
    {
        $paths = config('cors.paths');

        $this->assertIsArray($paths);
        $this->assertContains('broadcasting/auth', $paths,
            'config/cors.php must list broadcasting/auth so the Vercel frontend can authorize private Reverb channels.');
        $this->assertContains('api/*', $paths);
        $this->assertTrue((bool) config('cors.supports_credentials'));
    }
}
