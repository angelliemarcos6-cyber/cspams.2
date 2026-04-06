<?php

namespace App\Support\Mail;

final class MailDelivery
{
    public static function currentMailer(): string
    {
        return strtolower(trim((string) config('mail.default', 'log')));
    }

    public static function isSimulated(): bool
    {
        return in_array(self::currentMailer(), ['log', 'array'], true);
    }

    public static function simulatedStatus(): string
    {
        return 'logged';
    }

    /**
     * Detect obviously broken SMTP configs (placeholder host/credentials).
     */
    public static function isLikelyMisconfigured(): bool
    {
        $mailer = self::currentMailer();

        if (in_array($mailer, ['log', 'array'], true)) {
            return false; // intentionally simulated, not misconfigured
        }

        if ($mailer === 'resend') {
            $key = trim((string) config('services.resend.key', ''));
            return $key === '';
        }

        if ($mailer === 'smtp') {
            $host = strtolower(trim((string) config('mail.mailers.smtp.host', '')));
            $user = trim((string) config('mail.mailers.smtp.username', ''));
            $pass = trim((string) config('mail.mailers.smtp.password', ''));

            // localhost with no credentials = placeholder config
            if (in_array($host, ['127.0.0.1', 'localhost', ''], true) && $user === '' && $pass === '') {
                return true;
            }
        }

        $from = strtolower(trim((string) config('mail.from.address', '')));
        if ($from === '' || $from === 'hello@example.com') {
            return true;
        }

        return false;
    }

    public static function simulatedMessage(string $purpose): string
    {
        $mailer = self::currentMailer();
        $suffix = "Email delivery is configured as '{$mailer}', so no real emails are sent. Check `storage/logs/laravel.log` for the message, or configure `MAIL_MAILER=smtp` (or `MAIL_MAILER=resend`) to send real emails.";

        if ($purpose !== '') {
            return "{$purpose} {$suffix}";
        }

        return $suffix;
    }
}
