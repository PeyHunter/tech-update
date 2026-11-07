import { Brief, Days, Heat, ItemBody, KindLabel, inlineCode } from "./components.js";
import { formatDay, formatDuration, formatLongDay, formatMonth, formatShortDateTime, initials, sourceLabel } from "./format.js";
import { Page } from "./layout.js";
import type {
  AccountView,
  ArchiveIndexModel,
  ArchiveMonthModel,
  HomeModel,
  ItemModel,
  Layout,
  SourcesModel,
  StatusModel,
} from "./types.js";

type Filter = HomeModel["filter"];

function filterHref(f: Filter): string {
  const q = new URLSearchParams();
  if (f.kind !== "all") q.set("kind", f.kind);
  if (f.by) q.set("by", f.by);
  const s = q.toString();
  return s ? `/?${s}` : "/";
}

function FilterBar({ filter, people }: { filter: Filter; people: AccountView[] }) {
  const kinds = [
    { kind: "all", label: "All" },
    { kind: "news", label: "News" },
    { kind: "try", label: "Try it" },
  ] as const;
  return (
    <nav class="filters" aria-label="Filter items">
      <ul class="chips">
        {kinds.map((k) => {
          const on = filter.kind === k.kind;
          return (
            <li>
              <a class="chip" href={filterHref({ ...filter, kind: k.kind })} aria-current={on ? "true" : undefined}>
                {k.label}
              </a>
            </li>
          );
        })}
      </ul>
      {people.length > 0 ? (
        <ul class="chips chips-people">
          {people.map((p) => {
            const on = filter.by === p.handle;
            return (
              <li>
                <a
                  class="chip chip-person"
                  href={filterHref({ ...filter, by: on ? null : p.handle })}
                  aria-current={on ? "true" : undefined}
                  title={on ? `Stop filtering by ${p.name}` : `Only items ${p.name} talked about`}
                >
                  <span class="badge" aria-hidden="true">
                    {initials(p.name, p.handle)}
                  </span>
                  {p.name}
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
    </nav>
  );
}

function Empty({ title, children }: { title: string; children?: unknown }) {
  return (
    <div class="empty">
      <p class="empty-title">{title}</p>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

function Following({ people }: { people: HomeModel["following"] }) {
  return (
    <section class="following" aria-labelledby="following-head">
      <div class="following-head">
        <h2 id="following-head">From the people you follow</h2>
        <p>What they posted, shipped or said in the last 7 days. Checked every night.</p>
      </div>
      {people.length > 0 ? (
        <ul class="people">
          {people.map((p) => (
            <li class="person">
              <p class="person-name">
                <span class="badge" aria-hidden="true">
                  {initials(p.name, p.handle)}
                </span>
                <a href={`/?by=${p.handle}`}>{p.name}</a>
              </p>
              <ul class="person-updates">
                {p.updates.map((u) => {
                  const { dow, dm } = formatDay(u.date);
                  return (
                    <li>
                      <p>{inlineCode(u.text)}</p>
                      <p class="update-meta">
                        <time datetime={u.date}>
                          {dow} {dm}
                        </time>
                        <a href={u.url}>Open on {sourceLabel(u.source)}</a>
                      </p>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="Nothing from them in the last 7 days.">
          Their posts show up here after the nightly check, or press Refresh to look now.
        </Empty>
      )}
    </section>
  );
}

const doc = (el: unknown): string => `<!doctype html>${String(el)}`;

export function renderHome(m: HomeModel): string {
  const filtered = m.filter.kind !== "all" || m.filter.by !== null;
  const person = m.people.find((p) => p.handle === m.filter.by);
  return doc(
    <Page {...layout(m)}>
      <Following people={m.following} />
      <Brief brief={m.brief} />
      <section class="feed" aria-labelledby="feed-head">
        <div class="feed-head">
          <h2 id="feed-head">Last 30 days</h2>
          <FilterBar filter={m.filter} people={m.people} />
        </div>
        {m.days.length > 0 ? (
          <Days days={m.days} />
        ) : filtered ? (
          <Empty title="No items match this filter.">
            {person ? `${person.name} has not talked about anything ` : "Nothing "}
            {m.filter.kind === "try" ? "you can try " : m.filter.kind === "news" ? "in the news " : ""}
            in the last 30 days. <a href="/">Show all items</a>
          </Empty>
        ) : (
          <Empty title="No items yet.">
            New items appear here after each nightly research run. Older months are in the{" "}
            <a href="/archive">archive</a>.
          </Empty>
        )}
      </section>
    </Page>,
  );
}

export function renderItem(m: ItemModel): string {
  const { item } = m;
  return doc(
    <Page {...layout(m)} description={item.summary}>
      <article class={`item item-page item-${item.kind}`}>
        <p class="crumb">
          <a href="/">Home</a> <span aria-hidden="true">/</span>{" "}
          <a href={`/archive/${item.date.slice(0, 7)}`}>{formatMonth(item.date.slice(0, 7))}</a>
        </p>
        <div class="item-meta">
          <KindLabel kind={item.kind} />
          <Heat heat={item.heat} />
          <time datetime={item.date}>{formatLongDay(item.date)}</time>
        </div>
        <h1 class="item-title">{item.title}</h1>
        <ItemBody item={item} />
      </article>
    </Page>,
  );
}

export function renderArchiveIndex(m: ArchiveIndexModel): string {
  return doc(
    <Page {...layout(m)}>
      <h1 class="page-title">Archive</h1>
      <p class="lede">Every month keeps its brief and its items, also after it leaves the home page.</p>
      {m.months.length > 0 ? (
        <ul class="months">
          {m.months.map((mo) => (
            <li>
              <a href={`/archive/${mo.month}`}>{formatMonth(mo.month)}</a>
              <span class="count">{mo.count === 1 ? "1 item" : `${mo.count} items`}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="The archive is empty.">The first month appears here after the first research run.</Empty>
      )}
    </Page>,
  );
}

export function renderArchiveMonth(m: ArchiveMonthModel): string {
  return doc(
    <Page {...layout(m)} description={m.brief?.headline}>
      <p class="crumb">
        <a href="/archive">Archive</a> <span aria-hidden="true">/</span> {formatMonth(m.month)}
      </p>
      <Brief brief={m.brief} month={m.month} />
      <section class="feed" aria-labelledby="feed-head">
        <div class="feed-head">
          <h2 id="feed-head">All items in {formatMonth(m.month)}</h2>
        </div>
        {m.days.length > 0 ? <Days days={m.days} /> : <Empty title="No items this month." />}
      </section>
    </Page>,
  );
}

const OTHER_SOURCES = [
  { name: "Hacker News", text: "Front page and AI stories with 150 or more points." },
  { name: "GitHub trending", text: "AI repositories only." },
  { name: "Hugging Face daily papers and arXiv", text: "New research people are reading." },
  {
    name: "AI lab news pages",
    text: "Anthropic, OpenAI, Google DeepMind, Meta AI, Mistral, xAI, DeepSeek, Qwen, Hugging Face.",
  },
  { name: "Newsletters that sum up X", text: "The Rundown AI, Ben's Bites, TLDR AI, Latent Space." },
];

function AccountList({ accounts }: { accounts: AccountView[] }) {
  return (
    <ul class="accounts">
      {accounts.map((a) => (
        <li>
          <span class="badge badge-lg" aria-hidden="true">
            {initials(a.name, a.handle)}
          </span>
          <div>
            <p class="account-name">
              {a.name} <a href={`https://x.com/${a.handle}`}>@{a.handle}</a>
            </p>
            <p class="account-desc">{a.description}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function renderSources(m: SourcesModel): string {
  const high = m.accounts.filter((a) => a.priority === "high");
  const normal = m.accounts.filter((a) => a.priority === "normal");
  return doc(
    <Page {...layout(m)}>
      <h1 class="page-title">Sources</h1>
      <p class="lede">
        Every item links to its primary source. This is where the nightly research looks, and how much each
        place counts.
      </p>
      <section class="prose-section">
        <h2>People on X</h2>
        {m.accounts.length === 0 ? (
          <Empty title="The watch list is empty." />
        ) : (
          <>
            {high.length > 0 ? (
              <>
                <h3>Checked every night</h3>
                <p>A post from one of these people is a strong signal and raises an item's heat by one.</p>
                <AccountList accounts={high} />
              </>
            ) : null}
            {normal.length > 0 ? (
              <>
                <h3>Also followed</h3>
                <AccountList accounts={normal} />
              </>
            ) : null}
          </>
        )}
      </section>
      <section class="prose-section">
        <h2>GitHub</h2>
        <p>New commits and releases here are checked every run. A notable change becomes a "Try it" item.</p>
        <ul class="sources">
          {m.repos.map((r) => (
            <li>
              <strong>
                <a href={r.url}>{r.name}</a>
              </strong>{" "}
              {r.description}
            </li>
          ))}
        </ul>
      </section>
      <section class="prose-section">
        <h2>How X is read</h2>
        <p>X cannot be read reliably for free, so the research uses the best source it has and records which one:</p>
        <ol class="steps">
          <li>Web search for each person's recent posts. Free, but it can miss posts or find them a few days late.</li>
          <li>
            The same people outside X: Theo's YouTube channel, Matt Pocock's AI Hero newsletter and blog, the Nerd
            Snipe and Machine Gods podcasts, Platformer and the opencode repository.
          </li>
          <li>The X API, which is reliable but paid. It is off for now.</li>
        </ol>
      </section>
      <section class="prose-section">
        <h2>Other sources</h2>
        <p>These confirm a story and show how many people care about it.</p>
        <ul class="sources">
          {OTHER_SOURCES.map((s) => (
            <li>
              <strong>{s.name}</strong> {s.text}
            </li>
          ))}
        </ul>
      </section>
    </Page>,
  );
}

const STATUS_LABEL: Record<string, string> = { ok: "OK", partial: "Partial", failed: "Failed" };

const REFRESH_TEXT: Record<NonNullable<StatusModel["refresh"]>, { text: string; ok: boolean }> = {
  started: { ok: true, text: "Refresh started. New items show up here and on the home page in about 15 minutes." },
  running: { ok: true, text: "A research run is already going. Its items show up when it finishes." },
  cooldown: { ok: true, text: "The site was updated or refreshed within the last hour, so it did not start another run. Try again later." },
  unavailable: { ok: false, text: "Refresh is not set up on this server." },
  failed: { ok: false, text: "Refresh could not start a run. The nightly run still happens at 03:30." },
};

export function renderStatus(m: StatusModel): string {
  const last = m.runs[0];
  return doc(
    <Page {...layout(m)}>
      <h1 class="page-title">Status</h1>
      {m.refresh ? (
        <p class={REFRESH_TEXT[m.refresh].ok ? "notice" : "notice notice-bad"} role="status">
          {REFRESH_TEXT[m.refresh].text}
        </p>
      ) : null}
      <p class="lede">
        {last
          ? last.status === "failed"
            ? "The last nightly run failed. The site still shows the last good data."
            : "The nightly research job is running normally."
          : "No runs yet. The first nightly run will show up here."}
      </p>
      {m.runs.length > 0 ? (
        <table class="runs">
          <caption>Last {m.runs.length === 1 ? "run" : `${m.runs.length} runs`}, newest first</caption>
          <thead>
            <tr>
              <th scope="col">Started</th>
              <th scope="col">Duration</th>
              <th scope="col">Status</th>
              <th scope="col" class="num">
                Added
              </th>
              <th scope="col" class="num">
                Updated
              </th>
              <th scope="col" class="num">
                Rejected
              </th>
              <th scope="col">Error</th>
            </tr>
          </thead>
          <tbody>
            {m.runs.map((r) => (
              <tr class={`run-${r.status}`}>
                <td data-label="Started">
                  <time datetime={r.started_at}>{formatShortDateTime(r.started_at)}</time>
                </td>
                <td data-label="Duration">{formatDuration(r.duration_s)}</td>
                <td data-label="Status">
                  <span class={`status status-${r.status}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                </td>
                <td data-label="Added" class="num">
                  {r.items_added}
                </td>
                <td data-label="Updated" class="num">
                  {r.items_updated}
                </td>
                <td data-label="Rejected" class="num">
                  {r.items_rejected}
                </td>
                <td data-label="Error" class={r.error ? "error" : "error error-none"}>
                  {r.error ?? "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </Page>,
  );
}

export function renderNotFound(m: Layout): string {
  return doc(
    <Page {...layout(m)}>
      <h1 class="page-title">Page not found</h1>
      <p class="lede">
        There is nothing at <code>{m.path}</code>. Items keep their address forever, so the link may have a typo.
      </p>
      <p class="actions">
        <a href="/">Go to the home page</a> or browse the <a href="/archive">archive</a>.
      </p>
    </Page>,
  );
}

function layout(m: Layout): Layout {
  return { title: m.title, lastUpdated: m.lastUpdated, path: m.path };
}
