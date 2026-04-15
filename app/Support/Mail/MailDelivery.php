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
