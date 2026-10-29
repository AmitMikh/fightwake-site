// Builds the static site into dist: one landing page per language, the privacy
// policy, robots.txt, sitemap.xml and the web manifest. No dependencies.
//
//   node build.mjs           build
//   node build.mjs --serve   build, then serve dist on http://localhost:8080
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const config = JSON.parse(await readFile(path.join(root, 'config.json'), 'utf8'));
const strings = {};
for (const lang of config.languages) {
  strings[lang] = JSON.parse(await readFile(path.join(root, 'i18n', `${lang}.json`), 'utf8'));
}

const baseUrl = config.baseUrl.replace(/\/$/, '');
// Path prefix of the site, e.g. "/fightwake-site/" on a GitHub Pages project site or "/" on a custom domain.
const basePath = new URL(baseUrl + '/').pathname;
const asset = (file) => basePath + file;
const pagePath = (lang) => (lang === config.defaultLanguage ? basePath : `${basePath}${lang}/`);
const pageUrl = (lang) => new URL(pagePath(lang), baseUrl).href;
const privacyUrl = new URL(basePath + 'privacy/', baseUrl).href;

const css = (await readFile(path.join(root, 'static', 'fonts.css'), 'utf8')).replaceAll('url(fonts/', `url(${asset('fonts/')}`)
  + (await readFile(path.join(root, 'static', 'styles.css'), 'utf8'));

// The faces each language needs for the first screen; the rest load on demand.
const preloads = {
  latin: ['oswald-latin-500.woff2', 'barlow-latin-400.woff2'],
  ru: ['oswald-cyrillic-500.woff2', 'ibm-plex-sans-cyrillic-400.woff2'],
  he: ['karantina-hebrew-700.woff2', 'ibm-plex-sans-hebrew-hebrew-400.woff2'],
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// JSON inside <script> must not be able to close the tag.
const jsonLd = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

function formatPrice(amount, lang) {
  return new Intl.NumberFormat(lang, { style: 'currency', currency: config.prices.currency }).format(Number(amount));
}

const playIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#34A853" d="M3.6 1.8 13.4 12 3.6 22.2c-.4-.2-.6-.7-.6-1.2V3c0-.5.2-1 .6-1.2Z"/><path fill="#FBBC04" d="m16.8 8.6-3.4 3.4 3.4 3.4 3.8-2.2c1.1-.6 1.1-1.8 0-2.4l-3.8-2.2Z"/><path fill="#EA4335" d="M13.4 12 3.6 22.2c.3.2.8.2 1.3-.1l11.9-6.7-3.4-3.4Z"/><path fill="#4285F4" d="M13.4 12 16.8 8.6 4.9 1.9c-.5-.3-1-.3-1.3-.1L13.4 12Z"/></svg>`;

function playButton(t, campaign) {
  const url = `${config.playUrl}&referrer=${encodeURIComponent(`utm_source=website&utm_medium=${campaign}&utm_campaign=${t.lang}`)}`;
  return `<a class="play" href="${esc(url)}" aria-label="${esc(t.play.label)}">${playIcon}<span><small>${esc(t.play.getItOn)}</small><strong>Google Play</strong></span></a>`;
}

function head(t, { title, description, canonical, alternates, ogImageAlt }) {
  const fonts = preloads[t.lang] ?? preloads.latin;
  return `<!doctype html>
<html lang="${t.lang}" dir="${t.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
${alternates}
<meta name="theme-color" content="#0E0F11">${config.googleSiteVerification ? `
<meta name="google-site-verification" content="${esc(config.googleSiteVerification)}">` : ''}
<link rel="icon" type="image/png" sizes="32x32" href="${asset('favicon-32.png')}">
<link rel="icon" type="image/png" sizes="192x192" href="${asset('icon-192.png')}">
<link rel="apple-touch-icon" href="${asset('apple-touch-icon.png')}">
<link rel="manifest" href="${asset('site.webmanifest')}">
${fonts.map((f) => `<link rel="preload" href="${asset('fonts/' + f)}" as="font" type="font/woff2" crossorigin>`).join('\n')}
<meta property="og:type" content="website">
<meta property="og:site_name" content="FightWake">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${baseUrl}/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(ogImageAlt)}">
<meta property="og:locale" content="${t.ogLocale}">
<meta name="twitter:card" content="summary_large_image">
<style>${css}</style>`;
}

function header(t, currentLang, sections) {
  const langs = config.languages.map((l) => {
    const current = l === currentLang ? ' aria-current="page"' : '';
    return `<li><a href="${pagePath(l)}" hreflang="${l}" lang="${l}" title="${esc(strings[l].languageName)}"${current}>${l}</a></li>`;
  }).join('');
  return `<a class="skip" href="#main">${esc(t.nav.skip)}</a>
<header class="top">
  <div class="wrap">
    <a class="brand" href="${pagePath(currentLang ?? config.defaultLanguage)}"><img src="${asset('icon-192.png')}" alt="" width="32" height="32">FightWake</a>
    <nav>
      ${sections ? `<div class="sections"><a href="#how">${esc(t.nav.how)}</a><a href="#compare">${esc(t.nav.compare)}</a><a href="#faq">${esc(t.nav.faq)}</a></div>` : ''}
      <ul class="langs" aria-label="${esc(t.nav.language)}">${langs}</ul>
    </nav>
  </div>
</header>`;
}

function footer(t) {
  const contact = config.contactEmail
    ? `<a href="mailto:${esc(config.contactEmail)}">${esc(t.footer.contact)}</a>`
    : '';
  return `<footer>
  <div class="wrap">
    <p>© ${new Date().getFullYear()} FightWake. ${esc(t.footer.disclaimer)}</p>
    <nav><a href="${basePath}privacy/">${esc(t.footer.privacy)}</a>${contact}</nav>
  </div>
</footer>`;
}

function landingPage(lang) {
  const t = strings[lang];
  const alternates = config.languages
    .map((l) => `<link rel="alternate" hreflang="${l}" href="${pageUrl(l)}">`)
    .concat(`<link rel="alternate" hreflang="x-default" href="${pageUrl(config.defaultLanguage)}">`)
    .join('\n');

  const p = t.phone;
  const bout = (cls, names, left, right = '') =>
    `<div class="bout ${cls}"><span class="names" lang="en">${names}</span><span class="meta"><span>${esc(left)}</span>${right}</span></div>`;

  const plans = [];
  if (config.prices) {
    const c = t.compare;
    if (config.prices.eventPass) plans.push([c.eventPass, formatPrice(config.prices.eventPass, lang), c.eventPassBody]);
    if (config.prices.monthly) plans.push([c.monthly, `${formatPrice(config.prices.monthly, lang)} ${c.perMonth}`, '']);
    if (config.prices.annual) plans.push([c.annual, `${formatPrice(config.prices.annual, lang)} ${c.perYear}`, '']);
    if (config.prices.lifetime) plans.push([c.lifetime, `${formatPrice(config.prices.lifetime, lang)} ${c.oneTime}`, c.lifetimeBody]);
  }

  const offers = config.prices
    ? Object.entries(config.prices)
        .filter(([k, v]) => k !== 'currency' && v)
        .map(([k, v]) => ({ '@type': 'Offer', name: t.compare[k], price: String(v), priceCurrency: config.prices.currency }))
    : [];

  const structured = [
    {
      '@context': 'https://schema.org',
      '@type': 'MobileApplication',
      name: 'FightWake',
      description: t.meta.description,
      operatingSystem: 'Android',
      applicationCategory: 'SportsApplication',
      inLanguage: config.languages,
      url: pageUrl(lang),
      installUrl: config.playUrl,
      image: `${baseUrl}/icon-512.png`,
      offers: [{ '@type': 'Offer', price: '0', priceCurrency: config.prices?.currency ?? 'USD' }, ...offers],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      inLanguage: lang,
      mainEntity: t.faq.items.map((i) => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'FightWake',
      url: pageUrl(config.defaultLanguage),
      logo: `${baseUrl}/icon-512.png`,
      ...(config.contactEmail ? { email: config.contactEmail } : {}),
    },
  ];

  return `${head(t, { title: t.meta.title, description: t.meta.description, canonical: pageUrl(lang), alternates, ogImageAlt: t.meta.ogImageAlt })}
${structured.map(jsonLd).join('\n')}
</head>
<body>
${header(t, lang, true)}
<main id="main">

<section class="hero">
  <div class="wrap">
    <div class="hero-copy">
      <h1><span class="kicker">${esc(t.hero.kicker)}</span><span class="big">${esc(t.hero.lineA)} <em>${esc(t.hero.lineB)}</em></span></h1>
      <p class="lede">${esc(t.hero.lede)}</p>
      <div class="ctas">${playButton(t, 'hero')}<a class="text-link" href="#how">${esc(t.hero.secondary)}</a></div>
      <ul class="proof">${t.hero.proof.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    </div>
    <div class="phone" role="img" aria-label="${esc(p.label)}">
      <div class="ph-top"><b>${esc(p.title)}</b><span class="pill">${esc(p.live)}</span></div>
      <div class="seg">${esc(p.prelims)}</div>
      ${bout('done', 'Okafor vs Lindqvist', p.bantamweight, `<span>${esc(p.done)}</span>`)}
      ${bout('now', 'Reyes vs Hakimi', p.lightweight, `<span class="pill">${esc(p.live)}</span>`)}
      <div class="seg">${esc(p.mainCard)}</div>
      ${bout('', 'Moreau vs Tanaka', `${p.welterweight} · ${p.rounds3}`)}
      ${bout('armed', 'Kovac vs Adeyemi', p.mainEvent)}
      <div class="ph-alarm">${esc(p.alarm)}</div>
      <div class="seg ph-status">${esc(p.status)}</div>
    </div>
  </div>
</section>

<section id="how">
  <div class="wrap">
    <div class="head"><h2>${esc(t.how.title)}</h2><p>${esc(t.how.intro)}</p></div>
    <ol class="steps">
      ${t.how.steps.map((s, i) => `<li><span class="n" aria-hidden="true">${i + 1}</span><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p></li>`).join('\n      ')}
    </ol>
  </div>
</section>

<section id="features">
  <div class="wrap">
    <div class="head"><h2>${esc(t.features.title)}</h2></div>
    <div class="feats">
      ${t.features.items.map((f) => `<div class="feat"><span class="tier${f.tier === 'pro' ? ' pro' : ''}">${esc(t.features[f.tier])}</span><h3>${esc(f.title)}</h3><p>${esc(f.body)}</p></div>`).join('\n      ')}
    </div>
  </div>
</section>

<section id="compare">
  <div class="wrap">
    <div class="head"><h2>${esc(t.compare.title)}</h2><p>${esc(t.compare.intro)}</p></div>
    <div class="table-scroll">
      <table>
        <thead><tr><td></td><th scope="col">${esc(t.compare.free)}</th><th scope="col" class="pro">${esc(t.compare.pro)}</th></tr></thead>
        <tbody>
          ${t.compare.rows.map(([label, free, pro]) => `<tr><th scope="row">${esc(label)}</th><td>${esc(free)}</td><td class="pro">${esc(pro)}</td></tr>`).join('\n          ')}
        </tbody>
      </table>
    </div>
    ${plans.length ? `<h3>${esc(t.compare.plans)}</h3>
    <div class="plans">${plans.map(([name, price, body]) => `<div class="plan"><h3>${esc(name)}</h3><span class="price">${esc(price)}</span>${body ? `<p>${esc(body)}</p>` : ''}</div>`).join('')}</div>` : ''}
  </div>
</section>

<section id="faq">
  <div class="wrap">
    <div class="head"><h2>${esc(t.faq.title)}</h2></div>
    <div class="faq">
      ${t.faq.items.map((i, n) => `<details${n === 0 ? ' open' : ''}><summary>${esc(i.q)}</summary><p>${esc(i.a)}</p></details>`).join('\n      ')}
    </div>
  </div>
</section>

<section class="final">
  <div class="wrap">
    <h2>${esc(t.final.title)}</h2>
    <p>${esc(t.final.body)}</p>
    <div class="ctas">${playButton(t, 'footer')}</div>
  </div>
</section>

</main>
${footer(t)}
</body>
</html>
`;
}

async function privacyPage() {
  const t = strings[config.defaultLanguage];
  const body = (await readFile(path.join(root, 'privacy.html'), 'utf8'))
    .replace('{{contact}}', config.contactEmail
      ? `email <a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a>`
      : 'use the developer contact email on the FightWake Google Play listing');
  const title = 'Privacy policy · FightWake';
  const description = 'What FightWake collects, why, and how to have your data deleted.';
  return `${head(t, { title, description, canonical: privacyUrl, alternates: '', ogImageAlt: t.meta.ogImageAlt })}
</head>
<body>
${header(t, null, false)}
<main id="main">
<section class="doc">
  <div class="wrap">
${body}
  </div>
</section>
</main>
${footer(t)}
</body>
</html>
`;
}

async function build() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  await cp(path.join(root, 'static'), dist, {
    recursive: true,
    filter: (src) => !src.endsWith('.css'),
  });

  for (const lang of config.languages) {
    const dir = lang === config.defaultLanguage ? dist : path.join(dist, lang);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), landingPage(lang));
  }
  await mkdir(path.join(dist, 'privacy'), { recursive: true });
  await writeFile(path.join(dist, 'privacy', 'index.html'), await privacyPage());

  const today = new Date().toISOString().slice(0, 10);
  const links = config.languages
    .map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${pageUrl(l)}"/>`)
    .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl(config.defaultLanguage)}"/>`)
    .join('\n');
  const urls = config.languages
    .map((l) => `  <url>\n    <loc>${pageUrl(l)}</loc>\n    <lastmod>${today}</lastmod>\n${links}\n  </url>`)
    .concat(`  <url>\n    <loc>${privacyUrl}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`);
  await writeFile(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`);

  // Crawlers only read robots.txt at the domain root, so on a project site this file
  // only takes effect once the site moves to its own domain. The sitemap still works
  // when submitted in Search Console.
  await writeFile(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`);

  await writeFile(path.join(dist, 'site.webmanifest'), JSON.stringify({
    name: 'FightWake',
    short_name: 'FightWake',
    start_url: basePath,
    display: 'browser',
    background_color: '#0E0F11',
    theme_color: '#0E0F11',
    icons: [
      { src: asset('icon-192.png'), sizes: '192x192', type: 'image/png' },
      { src: asset('icon-512.png'), sizes: '512x512', type: 'image/png' },
    ],
  }, null, 2));

  // GitHub Pages runs Jekyll unless told not to.
  await writeFile(path.join(dist, '.nojekyll'), '');
  console.log(`Built ${config.languages.length} languages into ${path.relative(process.cwd(), dist) || dist} for ${baseUrl}`);
}

function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };
  createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') { res.writeHead(302, { Location: basePath }).end(); return; }
    if (!p.startsWith(basePath)) { res.writeHead(404).end('Not found'); return; }
    p = p.slice(basePath.length);
    if (p === '' || p.endsWith('/')) p += 'index.html';
    const file = path.join(dist, p);
    if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' }).end(data);
    } catch {
      res.writeHead(404).end('Not found');
    }
  }).listen(8080, () => console.log(`Serving on http://localhost:8080${basePath}`));
}

await build();
if (process.argv.includes('--serve')) serve();
