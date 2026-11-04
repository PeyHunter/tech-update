import type { Child } from "hono/jsx";
import { formatDateTime } from "./format.js";
import type { Layout } from "./types.js";

export const SITE_NAME = "tech-update";
export const SITE_DESCRIPTION = "What changed in AI this month, and what you can try today.";
export const SITE_URL = "https://tech-update.peytonhunter.com";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/archive", label: "Archive" },
  { href: "/sources", label: "Sources" },
  { href: "/status", label: "Status" },
] as const;

function isActive(href: string, path: string): boolean {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`);
}

export function Page(props: Layout & { description?: string; children: Child }) {
  const fullTitle = props.title === SITE_NAME ? SITE_NAME : `${props.title} | ${SITE_NAME}`;
  const description = props.description ?? SITE_DESCRIPTION;
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{fullTitle}</title>
        <meta name="description" content={description} />
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" content="#f4f6f5" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#121816" media="(prefers-color-scheme: dark)" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:title" content={fullTitle} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={`${SITE_URL}${props.path}`} />
        <link rel="canonical" href={`${SITE_URL}${props.path}`} />
        <link rel="alternate" type="application/rss+xml" title={`${SITE_NAME} RSS`} href="/rss.xml" />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <a class="skip" href="#main">
          Skip to content
        </a>
        <header class="masthead">
          <div class="wrap masthead-inner">
            <p class="brand">
              <a href="/">{SITE_NAME}</a>
            </p>
            <p class="tagline">{SITE_DESCRIPTION}</p>
            <p class="updated">
              {props.lastUpdated ? (
                <>
                  Updated <time datetime={props.lastUpdated}>{formatDateTime(props.lastUpdated)}</time>
                </>
              ) : (
                "Not updated yet"
              )}
            </p>
            <nav class="nav" aria-label="Main">
              <ul>
                {NAV.map((n) => (
                  <li>
                    <a href={n.href} aria-current={isActive(n.href, props.path) ? "page" : undefined}>
                      {n.label}
                    </a>
                  </li>
                ))}
                <li>
                  <a href="/rss.xml">RSS</a>
                </li>
              </ul>
            </nav>
          </div>
        </header>
        <main id="main" class="wrap">
          {props.children}
        </main>
        <footer class="colophon">
          <div class="wrap">
            <p>
              Researched every night from the people and sites on the <a href="/sources">sources</a> page. Times
              are Copenhagen time.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
