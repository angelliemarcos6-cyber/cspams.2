<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class AuthStatefulBrowserSessionTest extends TestCase
{
    use InteractsWithSeededCredentials;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('auth_mfa.monitor.enabled', true);
        config()->set('auth_mfa.monitor.test_code', '123456');
    }

    public function test_school_head_browser_login_establishes_usable_stateful_session_for_me_and_logout(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->with('school')->firstOrFail();
        $schoolCode = (string) $schoolHead->school?->school_code;

        $cookies = $this->bootstrapBrowserSessionCookies();

        $login = $this->browserJson('POST', '/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolCode,
            'password' => $this->demoPasswordForLogin('school_head', $schoolCode),
        ], $cookies);

        $login->assertOk()
            ->assertJsonPath('user.role', 'school_head')
            ->assertJsonPath('user.schoolCode', $schoolCode)
            ->assertJsonPath('token', fn ($value) => is_string($value) && $value !== '');

        $cookies = $this->mergeBrowserCookies($cookies, $login);

        $me = $this->browserJson('GET', '/api/auth/me', [], $cookies);
        $me->assertOk()
            ->assertJsonPath('user.role', 'school_head')
            ->assertJsonPath('user.schoolCode', $schoolCode);

        $sessions = $this->browserJson('GET', '/api/auth/sessions', [], $cookies);
        $sessions->assertOk();

        $currentSessionId = (string) $sessions->json('meta.currentSessionId');
        $this->assertNotSame('', $currentSessionId);

        $logout = $this->browserJson('POST', '/api/auth/logout', [], $cookies);
        $logout->assertStatus(Response::HTTP_NO_CONTENT);

        $this->assertDatabaseMissing('sessions', ['id' => $currentSessionId]);
    }

    public function test_monitor_browser_login_and_mfa_verification_establish_usable_stateful_session_for_me(): void
    {
        $this->seed();

        $cookies = $this->bootstrapBrowserSessionCookies();

        $login = $this->browserJson('POST', '/api/auth/login', [
            'role' => 'monitor',
            'login' => 'cspamsmonitor@gmail.com',
            'password' => $this->demoPasswordForLogin('monitor', 'cspamsmonitor@gmail.com'),
        ], $cookies);

        $login->assertStatus(Response::HTTP_ACCEPTED)
            ->assertJsonPath('requiresMfa', true)
            ->assertJsonPath('mfa.challengeId', fn ($value) => is_string($value) && $value !== '');

        $cookies = $this->mergeBrowserCookies($cookies, $login);
        $challengeId = (string) $login->json('mfa.challengeId');

        $verify = $this->browserJson('POST', '/api/auth/verify-mfa', [
            'role' => 'monitor',
            'login' => 'cspamsmonitor@gmail.com',
            'challenge_id' => $challengeId,
            'code' => '123456',
        ], $cookies);

        $verify->assertOk()
            ->assertJsonPath('user.role', 'monitor')
            ->assertJsonPath('token', fn ($value) => is_string($value) && $value !== '');

        $cookies = $this->mergeBrowserCookies($cookies, $verify);

        $me = $this->browserJson('GET', '/api/auth/me', [], $cookies);
        $me->assertOk()
            ->assertJsonPath('user.role', 'monitor');
    }

    public function test_school_head_browser_login_can_explicitly_request_stateful_session_without_bearer_token(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->with('school')->firstOrFail();
        $schoolCode = (string) $schoolHead->school?->school_code;

        $cookies = $this->bootstrapBrowserSessionCookies();

        $login = $this->browserJson('POST', '/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolCode,
            'password' => $this->demoPasswordForLogin('school_head', $schoolCode),
        ], $cookies, [
            'X-CSPAMS-Auth-Mode' => 'stateful',
        ]);

        $login->assertOk()
            ->assertJsonPath('user.role', 'school_head')
            ->assertJsonMissingPath('token');

        $cookies = $this->mergeBrowserCookies($cookies, $login);

        $me = $this->browserJson('GET', '/api/auth/me', [], $cookies, [
            'X-CSPAMS-Auth-Mode' => 'stateful',
        ]);
        $me->assertOk()
            ->assertJsonPath('user.role', 'school_head')
            ->assertJsonPath('user.schoolCode', $schoolCode);
    }

    /**
     * @return array<string, string>
     */
    private function bootstrapBrowserSessionCookies(): array
    {
        $csrf = $this->withHeaders($this->browserHeaders())
            ->get('/sanctum/csrf-cookie');

        $csrf->assertSuccessful();

        return $this->extractResponseCookies($csrf);
    }

    /**
     * @param array<string, mixed> $payload
     * @param array<string, string> $cookies
     */
    private function browserJson(string $method, string $uri, array $payload, array $cookies, array $extraHeaders = [])
    {
        $headers = array_merge($this->browserHeaders(), $extraHeaders);
        if ($method !== 'GET' && isset($cookies['XSRF-TOKEN'])) {
            $headers['X-XSRF-TOKEN'] = urldecode($cookies['XSRF-TOKEN']);
        }

        return match (strtoupper($method)) {
            'GET' => $this->withHeaders($headers)->withCookies($cookies)->getJson($uri),
            'POST' => $this->withHeaders($headers)->withCookies($cookies)->postJson($uri, $payload),
            default => throw new \InvalidArgumentException("Unsupported browser test method [{$method}]."),
        };
    }

    /**
     * @return array<string, string>
     */
    private function browserHeaders(): array
    {
        $frontendUrl = rtrim((string) config('app.frontend_url', 'http://localhost'), '/');

        return [
            'Accept' => 'application/json',
            'Origin' => $frontendUrl,
            'Referer' => $frontendUrl . '/',
            'X-Requested-With' => 'XMLHttpRequest',
        ];
    }

    /**
     * @param array<string, string> $cookies
     * @return array<string, string>
     */
    private function mergeBrowserCookies(array $cookies, $response): array
    {
        return array_merge($cookies, $this->extractResponseCookies($response));
    }

    /**
     * @return array<string, string>
     */
    private function extractResponseCookies($response): array
    {
        $cookies = [];

        foreach ($response->headers->getCookies() as $cookie) {
            $cookies[$cookie->getName()] = $cookie->getValue();
        }

        return $cookies;
    }
}
