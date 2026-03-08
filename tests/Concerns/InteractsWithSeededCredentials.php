<?php

namespace Tests\Concerns;

use Illuminate\Support\Str;

trait InteractsWithSeededCredentials
{
    protected function demoPasswordForLogin(string $role, string $login): string
    {
        $normalizedRole = strtolower(trim($role));

        if ($normalizedRole === 'school_head') {
            return $this->demoPasswordForKey('school:' . strtoupper(trim($login)));
        }

        if ($normalizedRole === 'monitor') {
            return $this->demoPasswordForKey('monitor');
        }

        return $this->demoPasswordForKey($normalizedRole);
    }

    protected function demoPasswordForKey(string $key): string
    {
        $configured = trim((string) env('CSPAMS_DEMO_PASSWORD'));
        if ($configured !== '') {
            return $configured;
        }

        $appKey = (string) config('app.key');
        if ($appKey === '') {
            return 'Demo@' . Str::upper(Str::random(10)) . '!';
        }

        $fingerprint = strtoupper(substr(hash_hmac('sha256', $key, $appKey), 0, 10));

        return 'Demo@' . $fingerprint . '!';
    }
}
