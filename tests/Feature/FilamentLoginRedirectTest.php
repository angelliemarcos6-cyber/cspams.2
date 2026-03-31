<?php

namespace Tests\Feature;

use Tests\TestCase;

class FilamentLoginRedirectTest extends TestCase
{
    public function test_admin_login_redirects_to_frontend_spa_login(): void
    {
        config()->set('app.frontend_url', 'https://frontend.example.test');

        $response = $this->get('/admin/login');

        $response->assertRedirect('https://frontend.example.test/#/');
    }
}
