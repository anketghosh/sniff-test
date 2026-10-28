# Deploying Sniff Test

Sniff Test is a standard Next.js 16 app. It has no database and no headless browser, so it runs anywhere Node.js runs.

## Option A: Vercel (recommended)

1. Push the repo to GitHub (see the main README).
2. Go to **[vercel.com/new](https://vercel.com/new)** and sign in with GitHub.
3. **Import** the `sniff-test` repository. Vercel detects Next.js automatically, so leave the build settings as they are.
4. *(Optional)* Under **Environment Variables**, add `APIFY_TOKEN` if you want visitors to check links without their own key. Leave it out for a public site where each visitor brings a key.
5. Click **Deploy**. About a minute later you get a live URL like `sniff-test.vercel.app`.

From then on, **every push to `main` redeploys** automatically, and pull requests get their own preview URLs.

### Things to know
- **Plan.** Vercel's free Hobby plan is for personal, non-commercial projects. Upgrade to Pro if you monetise.
- **Function time.** A link check can take 30–90 s while Apify collects reviews. The audit route asks for up to 300 s (`maxDuration` in `src/app/api/audit/route.ts`). If your plan allows less, use the 50- or 150-review option.
- **Cache.** Results are cached in memory for 6 hours per server instance. On serverless platforms instances come and go, so the cache is best-effort.

### Custom domain
In the Vercel project, open **Settings → Domains → Add**, enter your domain, then follow the DNS instructions at your registrar (usually one `A` or `CNAME` record). HTTPS is set up automatically.

## Option B: Docker (Render, Railway, Fly.io, any VPS)

The included `Dockerfile` builds a small production image from Next.js's standalone output.

```bash
docker build -t sniff-test .
docker run -p 3000:3000 sniff-test
# optional server-wide key:
docker run -p 3000:3000 -e APIFY_TOKEN=apify_api_xxx sniff-test
```

**Render:** New → Web Service → connect the repo → Runtime: *Docker* → add `APIFY_TOKEN` if wanted → Create. The free tier sleeps when idle, so the first request after a while is slow.

**Railway:** New Project → Deploy from GitHub repo. It picks up the `Dockerfile` automatically.

## Option C: plain Node server

```bash
npm ci
npm run build
node .next/standalone/server.js   # serves on PORT (default 3000)
```

Copy `public/` and `.next/static/` next to the standalone server, or use the Dockerfile, which does this for you.

## Before going public: checklist

- [ ] Decide whether to set a server `APIFY_TOKEN` (you pay for everyone) or leave it unset (each visitor adds their own key).
- [x] Point the README badges and Deploy button at `anketghosh/sniff-test` (done).
- [ ] Check the name and domain availability, and trademarks.
- [ ] Review the [compliance notes](../README.md#compliance--limitations) and get advice if you plan to make money from it.
