<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Broadcast;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Tests\TestCase;

class BroadcastChannelSecurityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('broadcasting.default', 'reverb');
        config()->set('broadcasting.connections.reverb.key', 'test-app-key');
        config()->set('broadcasting.connections.reverb.secret', 'test-app-secret');
        config()->set('broadcasting.connections.reverb.app_id', 'test-app-id');
        Broadcast::setDefaultDriver('reverb');

        require base_path('routes/channels.php');
    }

    public function test_realtime_channel_auth_requires_authenticated_user(): void
    {
        $this->seed();

        $response = $this->postJson('/api/broadcasting/auth', [
            'socket_id' => '1234.1234',
            'channel_name' => 'private-cspams-updates.monitor',
        ]);

        $response->assertStatus(Response::HTTP_UNAUTHORIZED);
    }

    public function test_school_head_can_authenticate_own_school_realtime_channel(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $status = $this->authorizeChannel($schoolHead, 'private-cspams-updates.school.' . $schoolHead->school_id);
        $this->assertSame(Response::HTTP_OK, $status);
    }

    public function test_school_head_cannot_authenticate_monitor_realtime_channel(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $status = $this->authorizeChannel($schoolHead, 'private-cspams-updates.monitor');
        $this->assertSame(Response::HTTP_FORBIDDEN, $status);
    }

    public function test_school_head_cannot_authenticate_other_school_realtime_channel(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        /** @var User $otherSchoolHead */
        $otherSchoolHead = User::query()->where('email', 'schoolhead2@cspams.local')->firstOrFail();
        $status = $this->authorizeChannel($schoolHead, 'private-cspams-updates.school.' . $otherSchoolHead->school_id);
        $this->assertSame(Response::HTTP_FORBIDDEN, $status);
    }

    public function test_monitor_can_authenticate_monitor_realtime_channel(): void
    {
        $this->seed();

        /** @var User $monitor */
        $monitor = User::query()->where('email', 'cspamsmonitor@gmail.com')->firstOrFail();
        $status = $this->authorizeChannel($monitor, 'private-cspams-updates.monitor');
        $this->assertSame(Response::HTTP_OK, $status);
    }

    private function authorizeChannel(User $user, string $channelName): int
    {
        $request = Request::create('/api/broadcasting/auth', 'POST', [
            'socket_id' => '1234.1234',
            'channel_name' => $channelName,
        ]);

        $request->setUserResolver(static fn () => $user);

        try {
            $response = Broadcast::auth($request);
        } catch (AccessDeniedHttpException) {
            return Response::HTTP_FORBIDDEN;
        }

        if ($response instanceof \Symfony\Component\HttpFoundation\Response) {
            return $response->getStatusCode();
        }

        return Response::HTTP_OK;
    }
}

