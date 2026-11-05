import { formatDay, formatMonth, initials, sourceLabel } from "./format.js";
import type { BriefView, HomeModel, ItemView } from "./types.js";

/** Text in `backticks` becomes <code>; everything else stays escaped text. */
export function inlineCode(text: string) {
  return text.split("`").map((part, i) => (i % 2 === 1 ? <code>{part}</code> : part));
}

export function Heat({ heat }: { heat: number }) {
  return (
    <span class={`heat heat-${heat}`} role="img" aria-label={`Heat ${heat} of 5`} title={`Heat ${heat} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i class={n <= heat ? "on" : undefined} />
      ))}
    </span>
  );
}

export function KindLabel({ kind }: { kind: string }) {
  return <span class={`kind kind-${kind}`}>{kind === "try" ? "Try it" : "News"}</span>;
}

function Mentions({ mentions }: { mentions: ItemView["mentions"] }) {
  if (mentions.length === 0) return null;
  return (
    <div class="mentions">
      <span class="mentions-label">Talked about by</span>
      <ul>
        {mentions.map((m) =>
          m.account_handle ? (
            <li>
              <a class="who" href={m.url} title={m.account_name ?? undefined}>
                <span class="badge" aria-hidden="true">
                  {initials(m.account_name, m.account_handle)}
                </span>
                @{m.account_handle}
              </a>
            </li>
          ) : (
            <li>
              <a class="who who-source" href={m.url}>
                {sourceLabel(m.source)}
                {m.metric ? ` · ${m.metric}` : ""}
              </a>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function Links({ links }: { links: ItemView["links"] }) {
  const sorted = [...links].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  return (
    <ul class="links">
      {sorted.map((l) => (
        <li>
          <a href={l.url} class={l.is_primary ? "primary" : undefined}>
            {l.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function ItemBody({ item }: { item: ItemView }) {
  return (
    <>
      <p class="summary">{inlineCode(item.summary)}</p>
      <div class="why">
        <h4>Why it matters</h4>
        <p>{inlineCode(item.why)}</p>
      </div>
      {item.kind === "try" && item.how_to_try ? (
        <div class="how">
          <h4>How to try</h4>
          <p>{inlineCode(item.how_to_try)}</p>
        </div>
      ) : null}
      <Mentions mentions={item.mentions} />
      <Links links={item.links} />
    </>
  );
}

export function ItemCard({ item }: { item: ItemView }) {
  return (
    <article class={`item item-${item.kind}`} id={item.slug}>
      <div class="item-meta">
        <KindLabel kind={item.kind} />
        <Heat heat={item.heat} />
      </div>
      <h3 class="item-title">
        <a href={`/item/${item.slug}`}>{item.title}</a>
      </h3>
      <ItemBody item={item} />
    </article>
  );
}

export function Days({ days }: { days: HomeModel["days"] }) {
  return (
    <div class="days">
      {days.map((d) => {
        const { dow, dm } = formatDay(d.date);
        return (
          <section class="day" aria-labelledby={`day-${d.date}`}>
            <h2 class="day-head" id={`day-${d.date}`}>
              <time datetime={d.date}>
                <span class="dow">{dow}</span> <span class="dm">{dm}</span>
              </time>
            </h2>
            <div class="day-items">
              {d.items.map((item) => (
                <ItemCard item={item} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function Brief({ brief, month }: { brief: BriefView | null; month?: string }) {
  if (!brief) {
    return (
      <section class="brief brief-empty" aria-labelledby="brief-head">
        <h1 id="brief-head" class="brief-headline">
          {month ? `No brief for ${formatMonth(month)}.` : "No brief for this month yet."}
        </h1>
        <p class="brief-period">
          {month
            ? "That month ended before a brief was written. Its items are below."
            : "The brief appears after the first nightly research run of the month. Items are listed below as they come in."}
        </p>
      </section>
    );
  }
  return (
    <section class="brief" aria-labelledby="brief-head">
      <p class="brief-period">{brief.period_label}</p>
      <h1 id="brief-head" class="brief-headline">
        {brief.headline}
      </h1>
      <ol class="points">
        {brief.points.map((p) => (
          <li>
            <h2 class="point-title">{p.title}</h2>
            <p>{inlineCode(p.text)}</p>
            {p.items.length > 0 ? (
              <p class="point-items">
                Based on{" "}
                {p.items.map((it, i) => (
                  <>
                    {i > 0 ? "; " : ""}
                    <a href={`/item/${it.slug}`}>{it.title}</a>
                  </>
                ))}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
