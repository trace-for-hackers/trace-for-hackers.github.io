# TRACE — Static website

Plain HTML, CSS and JavaScript. No build step, no dependencies. Works on GitHub Pages, Cloudflare Pages or Netlify.

Source code of the engine: https://github.com/trace-for-hackers/TRACE

## Structure

```
index.html                         main page
research/ docs/ about/ contact/    "coming soon" pages (noindex until they have content)
404.html                           error page
assets/css/styles.css              all styles
assets/js/main.js                  mobile menu, scroll reveal and email form
assets/icons.svg                   icon sprite (Lucide, ISC license)
assets/fonts/                      self-hosted Manrope and IBM Plex Mono (OFL)
assets/img/                        og.png (1200x630), logo.png, favicons
robots.txt  sitemap.xml  llms.txt  .well-known/security.txt
_headers                           security headers (Cloudflare Pages / Netlify)
.nojekyll                          required on GitHub Pages to publish .well-known/
```

## Before publishing

### 1. Domain
Every absolute URL (canonical, Open Graph, JSON-LD, sitemap, robots, llms.txt, security.txt) uses `https://trace.example.com`. Replace it in one go:

```bash
grep -rl "trace.example.com" . | xargs sed -i 's#https://trace.example.com#https://YOUR-DOMAIN#g'
grep -rl "contact@trace.example.com" . | xargs sed -i 's#contact@trace.example.com#YOUR-EMAIL#g'
```

Without a custom domain on GitHub Pages, the URL is `https://YOUR-USER.github.io/REPO-NAME`.
For a repository named `YOUR-USER.github.io`, it is just `https://YOUR-USER.github.io`.

### 2. Email form
A static site cannot store sign-ups. Open `assets/js/main.js` and set `SUBSCRIBE.endpoint`.
The options are documented at the top of that file: Formspree, Buttondown, Brevo, or your own function that calls Resend, Mailchimp or ConvertKit with the key kept on the server.

Then allow the service's origin in the CSP `connect-src`, in two places:
- the `<meta http-equiv="Content-Security-Policy">` in every HTML file;
- the `_headers` file.

Example for Formspree: `connect-src 'self' https://formspree.io`.

While the endpoint is empty, the form tells visitors that sign-ups aren't open yet. It never fakes a successful sign-up. On `localhost` it simulates success so you can test the visual states.

### 3. LinkedIn (optional)
The footer shows the GitHub icon. To add LinkedIn, paste this next to the GitHub link inside `<div class="footer__social">` on every page (use `../assets/icons.svg` in subpages), and add the URL to the `sameAs` list of the `Organization` JSON-LD in `index.html`:

```html
<a href="https://www.linkedin.com/in/YOUR-PROFILE" target="_blank" rel="noopener noreferrer" aria-label="TRACE on LinkedIn (opens in a new tab)"><svg class="icon" aria-hidden="true" focusable="false"><use href="assets/icons.svg#linkedin"></use></svg></a>
```

## Deploy

### GitHub Pages
1. Push **the contents of this folder** to the repository root, including `.nojekyll` and `.well-known/`.
   Use a separate repository (or a `gh-pages` branch) so the site doesn't mix with the engine's source code.
2. Settings → Pages → Source: *Deploy from a branch* → pick the branch, folder `/ (root)`.
3. Custom domain: Settings → Pages → Custom domain, then tick *Enforce HTTPS*.

Limitation: GitHub Pages **does not send custom HTTP headers**. The CSP still works through the `<meta>` tag, but HSTS, `frame-ancestors`, `X-Content-Type-Options` and `Permissions-Policy` never reach the browser. As a stopgap against clickjacking, `main.js` hides the page if it is loaded inside a third-party iframe.
To get every header, deploy on Cloudflare Pages or put the domain behind Cloudflare's proxy.

`404.html` uses absolute paths (`/assets/...`). It renders correctly on a custom domain or on `user.github.io`. On a project site (`user.github.io/repo/`), the error page shows up unstyled.

### Cloudflare Pages (recommended for security)
Workers & Pages → Create → Pages → connect the repository or upload this folder.
Build command: empty. Output directory: `/`. `_headers` is applied automatically.

## Run locally
```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Security
- Strict CSP: `'self'` only, no `unsafe-inline`, no `eval`. No third-party scripts, styles or fonts.
- Self-hosted fonts: no requests to Google, so visitors' IPs aren't shared with third parties.
- Email form: validation, a 254-character limit, control-character rejection, a honeypot, a minimum time-to-submit, a request timeout and `credentials: "omit"`.
- No keys or secrets in the front end.
- `security.txt` (RFC 9116), valid until 2027-10-28. Renew it before then.

## SEO / GEO
- Semantic HTML, a single H1, one H2 per section, `lang="en"`.
- Title, description, canonical, Open Graph and Twitter Card on every page.
- JSON-LD: Organization, WebSite, SoftwareApplication (with `featureList`), Service and FAQPage. FAQPage answers match the visible text word for word.
- FAQ built on `<details>`: the answers are in the HTML and indexable even while collapsed.
- `llms.txt` with a factual summary of the product for AI engines.
- "Coming soon" pages are `noindex` and left out of the sitemap. Once they have real content, remove the `noindex` and add them to `sitemap.xml`.
