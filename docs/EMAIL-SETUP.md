# Email Setup (Alerts & Scheduled Reports)

LogNog sends email two ways — **alert Email actions** and **scheduled report delivery** — and both use the same SMTP configuration (nodemailer). Configure it once and both work.

## Environment variables

Set these in your `.env` (and in your production deploy's environment), then restart the API:

```bash
SMTP_HOST=smtp.resend.com     # your SMTP server
SMTP_PORT=465                 # 465 (TLS) or 587 (STARTTLS)
SMTP_SECURE=true              # true for port 465, false for 587
SMTP_USER=resend              # SMTP username
SMTP_PASS=re_xxxxxxxxxxxx     # SMTP password / API key
SMTP_FROM=LogNog <alerts@yourdomain.com>
```

Email is considered configured when `SMTP_HOST` and `SMTP_USER` are set. Each alert's **Email action** has its own `to:` recipient — set it when you create the alert.

## Quick start with Resend (free)

[Resend](https://resend.com) has a free tier (3,000 emails/month, 100/day) and works over plain SMTP:

1. Sign up at https://resend.com and create an API key (**API Keys** → Create).
2. Use the settings above: host `smtp.resend.com`, port `465`, secure `true`, user `resend`, pass = your API key (`re_…`).

### Testing vs. real recipients — read this part

- **Sandbox sender (works immediately):** `SMTP_FROM=LogNog <onboarding@resend.dev>` needs **no domain setup**, but Resend only delivers it **to the email address that owns the Resend account**. Perfect for testing and for alerting yourself; nothing else.
- **Real recipients (verify a domain):** to email anyone else, verify a domain you own:
  1. Go to **https://resend.com/domains** → **Add Domain** → enter your domain (e.g. `yourdomain.com`).
  2. Resend shows a few DNS records (MX + TXT for the return-path, DKIM TXT). Add them at your DNS host — for Cloudflare, add them as **DNS only** (they aren't proxied types anyway).
  3. Click **Verify** in Resend (usually completes within minutes).
  4. Change `SMTP_FROM` to an address on that domain, e.g. `LogNog Alerts <alerts@yourdomain.com>`, in your `.env` **and** your production environment, then restart the API.

Docs: https://resend.com/docs/send-with-smtp · https://resend.com/docs/dashboard/domains/introduction

## Alternatives

Any SMTP provider drops in by changing the same variables:

| Provider | Free tier | Notes |
|----------|-----------|-------|
| [Brevo](https://www.brevo.com) | 300 emails/day | `smtp-relay.brevo.com:587` |
| [Amazon SES](https://aws.amazon.com/ses/) | — (~$0.10 / 1,000) | Cheapest at volume; needs domain + region setup |
| Gmail SMTP | free, low volume | `smtp.gmail.com:465` with an [App Password](https://myaccount.google.com/apppasswords); fine for personal alerts |

## Not email? Use Apprise

The stack also runs an [Apprise](https://github.com/caronc/apprise) gateway (port 8002) for **Slack, Discord, Teams, Telegram, and 100+ other channels** — add those as alert notification actions instead of (or alongside) email.

## Troubleshooting

- **Delivers to you but nobody else** → you're on the Resend sandbox sender (`onboarding@resend.dev`); verify a domain (above).
- **Sends rejected after changing `SMTP_FROM`** → the From domain isn't verified with your provider yet.
- **Nothing arrives** → check spam/promotions first; then confirm port/secure pairing (465↔`true`, 587↔`false`).
- **Works locally, not in production** → the `SMTP_*` variables must also exist in the production container's environment, not just your local `.env`.
