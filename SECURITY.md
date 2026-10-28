# Security

## How keys and data are handled

- **Visitor Apify keys** are stored only in the visitor's browser (`localStorage`). They're sent to this app's server with each link check, forwarded to `api.apify.com`, and never logged or stored server-side.
- **Server key** (`APIFY_TOKEN`) is read from environment variables and is never sent to the browser. `/api/config` only reports whether one exists.
- **Pasted and uploaded reviews** are processed entirely in the browser and never uploaded.
- **Never commit `.env.local`.** It's ignored by `.gitignore`; only `.env.example` (with no values) is committed.

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Report privately through GitHub's **Security → Report a vulnerability** on this repository. You'll get a response as soon as possible.
