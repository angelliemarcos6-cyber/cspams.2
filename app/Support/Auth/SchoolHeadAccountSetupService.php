<?php

namespace App\Support\Auth;

use App\Models\AccountSetupToken;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class SchoolHeadAccountSetupService
{
    /**
     * @return array{plainToken: string, setupUrl: string, expiresAt: string}
     */
    public function issue(
        User $user,
        ?User $issuedBy = null,
        ?string $issuedIp = null,
        ?string $issuedUserAgent = null,
        int $ttlHours = 24,
    ): array {
        $this->expireOpenTokens($user, $issuedIp, $issuedUserAgent);

        $expiresAt = CarbonImmutable::now()->addHours(max(1, $ttlHours));
        $secret = Str::random(64);

        $token = AccountSetupToken::query()->create([
            'user_id' => $user->id,
            'issued_by_user_id' => $issuedBy?->id,
            'token_hash' => Hash::make($secret),
            'expires_at' => $expiresAt,
            'issued_ip' => $this->normalizeIpAddress($issuedIp),
            'issued_user_agent' => $this->normalizeUserAgent($issuedUserAgent),
        ]);

        $plainToken = $token->id . '.' . $secret;

        return [
            'plainToken' => $plainToken,
            'setupUrl' => $this->buildSetupUrl($plainToken),
            'expiresAt' => $expiresAt->toISOString(),
        ];
    }

    public function resolve(string $plainToken): ?AccountSetupToken
    {
        [$tokenId, $secret] = $this->parsePlainToken($plainToken);
        if ($tokenId === null || $secret === null) {
            return null;
        }

        /** @var AccountSetupToken|null $token */
        $token = AccountSetupToken::query()->find($tokenId);
        if (! $token || ! is_string($token->token_hash) || $token->token_hash === '') {
            return null;
        }

        if (! Hash::check($secret, $token->token_hash)) {
            return null;
        }

        if (! $token->isUsable()) {
            return null;
        }

        return $token;
    }

    public function consume(AccountSetupToken $token, ?string $usedIp = null, ?string $usedUserAgent = null): void
    {
        $now = now();

        $token->forceFill([
            'used_at' => $now,
            'used_ip' => $this->normalizeIpAddress($usedIp),
            'used_user_agent' => $this->normalizeUserAgent($usedUserAgent),
        ])->save();

        AccountSetupToken::query()
            ->where('user_id', $token->user_id)
            ->where('id', '!=', $token->id)
            ->whereNull('used_at')
            ->update([
                'used_at' => $now,
                'used_ip' => $this->normalizeIpAddress($usedIp),
                'used_user_agent' => $this->normalizeUserAgent($usedUserAgent),
                'updated_at' => $now,
            ]);
    }

    public function buildSetupUrl(string $plainToken): string
    {
        $frontend = trim((string) config('app.frontend_url', ''));
        if ($frontend === '') {
            $frontend = (string) config('app.url', 'http://127.0.0.1:8000');
        }

        $frontend = rtrim($frontend, '/');

        return $frontend . '/#/setup-account?token=' . urlencode($plainToken);
    }

    private function expireOpenTokens(User $user, ?string $usedIp = null, ?string $usedUserAgent = null): void
    {
        $now = now();

        AccountSetupToken::query()
            ->where('user_id', $user->id)
            ->whereNull('used_at')
            ->update([
                'used_at' => $now,
                'used_ip' => $this->normalizeIpAddress($usedIp),
                'used_user_agent' => $this->normalizeUserAgent($usedUserAgent),
                'updated_at' => $now,
            ]);
    }

    /**
     * @return array{0: ?int, 1: ?string}
     */
    private function parsePlainToken(string $plainToken): array
    {
        $normalized = trim($plainToken);
        if ($normalized === '') {
            return [null, null];
        }

        $parts = explode('.', $normalized, 2);
        if (count($parts) !== 2) {
            return [null, null];
        }

        [$tokenIdRaw, $secret] = $parts;
        if (! ctype_digit($tokenIdRaw)) {
            return [null, null];
        }

        $tokenId = (int) $tokenIdRaw;
        if ($tokenId <= 0 || trim($secret) === '') {
            return [null, null];
        }

        return [$tokenId, $secret];
    }

    private function normalizeIpAddress(?string $value): ?string
    {
        $normalized = trim((string) $value);

        return $normalized !== '' ? $normalized : null;
    }

    private function normalizeUserAgent(?string $value): ?string
    {
        $normalized = trim((string) $value);
        if ($normalized === '') {
            return null;
        }

        return Str::limit($normalized, 500, '');
    }
}
