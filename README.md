# FightWake website

The website for [FightWake](https://play.google.com/store/apps/details?id=com.fightwake.app), the UFC and MMA fight alarm for Android: a static one-page site with one page per app language, plus the privacy policy. No framework and no dependencies. It's live at https://amitmikh.github.io/fightwake-site/.

```bash
node build.mjs           # build into dist/
node build.mjs --serve   # build, then open http://localhost:8080/fightwake-site/
```

Every push to `main` deploys it to GitHub Pages through `.github/workflows/deploy.yml`.

## Files

- `config.json`: the site URL, the Play Store link, the contact email, prices and the languages.
- `i18n/<lang>.json`: all page text. Each language becomes its own page (`/`, `/es/`, `/fr/`, `/ru/`, `/he/`). Fighter names in the phone mockup are made up and stay in English. Feature claims should match what the app does, so update the text when app behavior changes.
- `privacy.html`: the privacy policy body, English only. `{{contact}}` is replaced with the contact email.
- `static/`: the stylesheet, fonts, icons and the share image (`og-image.png`, 1200 × 630). `fonts.css` and `styles.css` are inlined into each page, everything else is copied as is.

## Config

- `baseUrl`: where the site lives, without a trailing slash. Canonical links, hreflang, the sitemap and asset paths all come from it. To move to your own domain, set it to `https://yourdomain.com`, add a `static/CNAME` file containing the domain, and set the domain under the repo's Settings > Pages.
- `contactEmail`: shown in the footer and the privacy policy. While it's `null` the footer has no contact link and the privacy policy points to the Play listing's developer email.
- `googleSiteVerification`: the code from Search Console's HTML tag verification method. It's added as a meta tag on every page.
- `prices`: `null` hides the plan cards. To show them, give a currency and any of `eventPass`, `monthly`, `annual`, `lifetime` as strings, for example `{ "currency": "USD", "eventPass": "2.99", "lifetime": "29.99" }`. Prices are formatted per language and added to the structured data.

## Colors and fonts

The palette and the type pairing match the app (`mobile/src/theme.ts` and `mobile/src/fonts.ts` in the app repo), including the same Russian and Hebrew substitutions. If the app's colors change, change `static/styles.css` too.

To refresh the fonts, download woff2 files for Oswald, Barlow, IBM Plex Sans, IBM Plex Sans Hebrew and Karantina (latin, latin-ext, cyrillic and hebrew subsets) into `static/fonts/` and update the `@font-face` rules in `static/fonts.css`.

## After the first deploy

1. In Google Search Console, add the site's URL as a URL-prefix property and pick the HTML tag method. Put the `content` value into `googleSiteVerification`, push, click Verify, then submit `sitemap.xml` under Sitemaps.
2. In Play Console, set the store listing's website to the site URL and the privacy policy to `<site>/privacy/`.
