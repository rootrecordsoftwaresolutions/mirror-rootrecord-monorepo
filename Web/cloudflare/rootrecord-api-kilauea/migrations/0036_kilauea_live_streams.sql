-- Kīlauea Alerts Android: embeddable live streams (YouTube). Public read via GET /api/mobile/kilauea-live-streams.
-- Ops updates: POST /api/internal/kilauea-live-streams (X-RR-Push-Admin-Key).

CREATE TABLE IF NOT EXISTS kilauea_live_streams (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  watch_url TEXT NOT NULL,
  youtube_video_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kilauea_live_streams_sort ON kilauea_live_streams (sort_order);

INSERT INTO kilauea_live_streams (id, title, description, watch_url, youtube_video_id, sort_order, updated_at)
VALUES
  (
    'two_pineapples',
    'Two Pineapples (YouTube)',
    'Independent Hawaiʻi volcano coverage. Opens the active livestream when on air.',
    'https://www.youtube.com/@TwoPineapples/live',
    NULL,
    0,
    datetime('now')
  ),
  (
    'usgs_v1',
    '[V1cam] West Halemaʻumaʻu',
    'USGS summit thermal/visual feed (official YouTube stream).',
    'https://www.youtube.com/watch?v=HggWKlZv9yk',
    'HggWKlZv9yk',
    1,
    datetime('now')
  ),
  (
    'usgs_v2',
    '[V2cam] North Halemaʻumaʻu',
    'USGS summit area monitoring (official YouTube stream).',
    'https://www.youtube.com/watch?v=Tz5tPqRRv1Y',
    'Tz5tPqRRv1Y',
    2,
    datetime('now')
  ),
  (
    'usgs_v3',
    '[V3cam] Halemaʻumaʻu lava lake',
    'USGS lava lake view when active (official YouTube stream).',
    'https://www.youtube.com/watch?v=gXKuUyKt8mc',
    'gXKuUyKt8mc',
    3,
    datetime('now')
  );
