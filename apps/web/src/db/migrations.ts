// Numbered migrations, embedded so the build needs no asset copy. Index + 1 = PRAGMA user_version.
export const MIGRATIONS: readonly string[] = [
  /* 001 initial schema + watch list */ `
CREATE TABLE runs (
  id             INTEGER PRIMARY KEY,
  started_at     TEXT NOT NULL,
  finished_at    TEXT,
  status         TEXT NOT NULL CHECK (status IN ('ok', 'failed', 'partial')),
  backend        TEXT NOT NULL,
  items_added    INTEGER NOT NULL DEFAULT 0,
  items_updated  INTEGER NOT NULL DEFAULT 0,
  items_rejected INTEGER NOT NULL DEFAULT 0,
  error          TEXT,
  notes          TEXT
);

CREATE TABLE items (
  id         INTEGER PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  date       TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('news', 'try')),
  title      TEXT NOT NULL,
  summary    TEXT NOT NULL,
  why        TEXT NOT NULL,
  how_to_try TEXT,
  heat       INTEGER NOT NULL CHECK (heat BETWEEN 2 AND 5),
  status     TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  run_id     INTEGER REFERENCES runs(id)
);
CREATE INDEX items_date ON items(date);

CREATE TABLE item_links (
  id         INTEGER PRIMARY KEY,
  item_id    INTEGER NOT NULL REFERENCES items(id),
  label      TEXT NOT NULL,
  url        TEXT NOT NULL,
  is_primary INTEGER NOT NULL CHECK (is_primary IN (0, 1)),
  UNIQUE (item_id, url)
);

CREATE TABLE item_mentions (
  id             INTEGER PRIMARY KEY,
  item_id        INTEGER NOT NULL REFERENCES items(id),
  account_handle TEXT,
  source         TEXT NOT NULL CHECK (source IN ('x', 'hn', 'github', 'arxiv', 'lab', 'newsletter', 'youtube')),
  url            TEXT NOT NULL,
  metric         TEXT,
  seen_at        TEXT NOT NULL,
  UNIQUE (item_id, url)
);
CREATE INDEX item_mentions_handle ON item_mentions(account_handle);

CREATE TABLE briefs (
  month        TEXT PRIMARY KEY,
  headline     TEXT NOT NULL,
  points       TEXT NOT NULL,
  period_label TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  run_id       INTEGER REFERENCES runs(id)
);

CREATE TABLE accounts (
  handle      TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority    TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('high', 'normal')),
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

INSERT INTO accounts (handle, name, description, priority) VALUES
  ('poteto',        'Lauren',          'Grok at SpaceX/xAI, React compiler core, ex-Cursor/Meta/Netflix', 'high'),
  ('mattpocockuk',  'Matt Pocock',     'TypeScript and AI teacher (AI Hero)', 'high'),
  ('theo',          'Theo',            'T3 Code, T3 Chat, YouTube', 'high'),
  ('thdxr',         'dax',             'opencode', 'normal'),
  ('thsottiaux',    'Tibo',            'Codex and ChatGPT at OpenAI', 'normal'),
  ('alexandr_wang', 'Alexandr Wang',   'Meta Superintelligence Labs', 'normal'),
  ('davis7',        'Ben Davis',       'Nerd Snipe podcast', 'normal'),
  ('vojta_holik',   'Vojta Holik',     'Design engineering', 'normal'),
  ('tobi',          'Tobi Lütke',      'Shopify', 'normal'),
  ('kevinroose',    'Kevin Roose',     'Tech journalist, Machine Gods podcast', 'normal'),
  ('caseynewton',   'Casey Newton',    'Platformer, Machine Gods podcast', 'normal'),
  ('ezraklein',     'Ezra Klein',      'NYT, AI-policy and culture interviews', 'normal');
`,
];
