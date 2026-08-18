-- ============================================
-- 타임플래너 DB 스키마 (SQLite)
-- 시간은 전부 "하루 중 분(0~1439)" 정수로 저장합니다.
-- 예: 07:30 -> 450,  19:00 -> 1140
-- ============================================

PRAGMA foreign_keys = ON;

-- 카테고리 (예: 업무, 운동, 휴식 ...)
CREATE TABLE IF NOT EXISTS category (
  category_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  color         TEXT,                 -- '#E8720C' 같은 색상 코드
  icon          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

-- 루틴 (예: "아침 루틴", "출근 준비")
CREATE TABLE IF NOT EXISTS routine (
  routine_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  description   TEXT,
  color         TEXT,
  icon          TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,   -- 0/1 (boolean)
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 루틴을 구성하는 개별 항목 (예: "아침 루틴" 안의 "스트레칭", "샤워")
CREATE TABLE IF NOT EXISTS routine_item (
  routine_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  routine_id      INTEGER NOT NULL,
  name            TEXT NOT NULL,
  category_id     INTEGER,
  duration        INTEGER NOT NULL,     -- 분 단위 길이 (예: 15)
  preferred_time  INTEGER,              -- 선호 시작 시각, 분 단위 (없으면 NULL)
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (routine_id)  REFERENCES routine(routine_id)   ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES category(category_id) ON DELETE SET NULL
);

-- 루틴이 언제 반복되는지 (요일/기간)
CREATE TABLE IF NOT EXISTS routine_schedule (
  schedule_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  routine_id    INTEGER NOT NULL,
  frequency     TEXT NOT NULL,          -- 'daily' | 'weekly' | 'custom'
  days_of_week  TEXT,                   -- 예: '1,2,3,4,5' (월~금, 0=일요일)
  start_date    TEXT NOT NULL,          -- 'YYYY-MM-DD'
  end_date      TEXT,                   -- NULL이면 무기한
  FOREIGN KEY (routine_id) REFERENCES routine(routine_id) ON DELETE CASCADE
);

-- 하루 단위 설정 (기상/취침/식사 시각) - 날짜당 1행
CREATE TABLE IF NOT EXISTS day_settings (
  day_setting_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  date            TEXT NOT NULL UNIQUE,   -- 'YYYY-MM-DD'
  wake_up_time    INTEGER,                -- 분 단위 (예: 420 = 07:00)
  breakfast_time  INTEGER,
  lunch_time      INTEGER,
  dinner_time     INTEGER,
  sleep_time      INTEGER
);

-- 실제 일정 (하루의 할 일 하나하나)
CREATE TABLE IF NOT EXISTS event (
  event_id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title             TEXT NOT NULL,
  date              TEXT NOT NULL,        -- 'YYYY-MM-DD'
  start_time        INTEGER NOT NULL,     -- 분 단위
  end_time          INTEGER NOT NULL,     -- 분 단위 (start_time보다 커야 함)
  category_id       INTEGER,
  routine_item_id   INTEGER,              -- 루틴에서 생성된 일정이면 원본 항목 참조
  event_type        TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'routine'
  is_top3           INTEGER NOT NULL DEFAULT 0,       -- ★ Top3 표시 (0/1)
  is_completed      INTEGER NOT NULL DEFAULT 0,       -- 완료 여부 (0/1)
  is_locked         INTEGER NOT NULL DEFAULT 0,       -- 🔒 고정 여부 (0/1)
  memo              TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (category_id)     REFERENCES category(category_id)         ON DELETE SET NULL,
  FOREIGN KEY (routine_item_id) REFERENCES routine_item(routine_item_id) ON DELETE SET NULL,
  CHECK (end_time > start_time)
);

-- ---- 인덱스 ----
CREATE INDEX IF NOT EXISTS idx_event_date          ON event(date);
CREATE INDEX IF NOT EXISTS idx_event_category      ON event(category_id);
CREATE INDEX IF NOT EXISTS idx_event_routine_item  ON event(routine_item_id);
CREATE INDEX IF NOT EXISTS idx_routine_item_routine ON routine_item(routine_id);
CREATE INDEX IF NOT EXISTS idx_routine_schedule_routine ON routine_schedule(routine_id);
