# Third-party browser assets

The app bundles these MIT-licensed distributions from the official npm registry:

| Package | Version | License copy |
| --- | --- | --- |
| KaTeX | 0.19.1 | public/vendor/katex-0.19.1/LICENSE |
| Mermaid | 12.3.0 | public/vendor/mermaid-12.3.0/LICENSE |

KaTeX includes its distributed WOFF2 math fonts. Its CSS is modified to omit WOFF/TTF fallback URLs; font and JavaScript contents are otherwise preserved. Mermaid is the official standalone minified browser distribution, including its bundled dependencies and their embedded license notices.

Archive URLs and SHA-512 integrity values are recorded in vendor-lock.json. Rebuild with `python3 tools/vendor_assets.py`. Normal application development and Cloudflare Pages deployments require no install or build step.

Recommended browser: Safari 17.4 or newer, or a current Chrome/Firefox. Mermaid 12 targets ES2024. The initial vendor payload is approximately 1.92 MB with gzip compression (6.09 MB uncompressed), including all local math fonts. Actual wire size depends on CDN compression and headers. This payload is reused from a version-specific Service Worker cache and is not invalidated by ordinary app-shell updates.
