-- ============================================================
--  สกีมาฐานข้อมูล D1 สำหรับบัญชีรายรับรายจ่าย LINE Bot
--  รัน: wrangler d1 execute expense-bot-db --remote --file=./schema.sql
-- ============================================================

-- ผู้ใช้ (แยกตาม LINE userId)
CREATE TABLE IF NOT EXISTS users (
  line_user_id TEXT PRIMARY KEY,
  display_name  TEXT,
  monthly_budget REAL DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- หมวดหมู่
CREATE TABLE IF NOT EXISTS categories (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT NOT NULL,
  type    TEXT NOT NULL DEFAULT 'expense',
  icon    TEXT DEFAULT '💸',
  user_id TEXT,
  FOREIGN KEY (user_id) REFERENCES users(line_user_id)
);

-- ธุรกรรม
CREATE TABLE IF NOT EXISTS transactions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL,
  amount       REAL NOT NULL,
  type         TEXT NOT NULL DEFAULT 'expense',
  category_id  INTEGER,
  note         TEXT,
  receipt_key  TEXT,
  tx_date      TEXT NOT NULL,
  created_at   TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id)     REFERENCES users(line_user_id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, tx_date);
CREATE INDEX IF NOT EXISTS idx_tx_user_cat  ON transactions(user_id, category_id);

-- เป้าหมายการออม
CREATE TABLE IF NOT EXISTS savings_goals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  target      REAL NOT NULL,
  current     REAL NOT NULL DEFAULT 0,
  deadline    TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(line_user_id)
);

-- หมวดหมู่ default
INSERT OR IGNORE INTO categories (id, name, type, icon, user_id) VALUES
  (1, 'อาหาร',      'expense', '🍜', NULL),
  (2, 'เดินทาง',    'expense', '🚗', NULL),
  (3, 'ช้อปปิ้ง',    'expense', '🛍️', NULL),
  (4, 'ที่พัก',      'expense', '🏠', NULL),
  (5, 'สุขภาพ',      'expense', '💊', NULL),
  (6, 'ความบันเทิง', 'expense', '🎬', NULL),
  (7, 'อื่นๆ',       'expense', '📦', NULL),
  (8, 'เงินเดือน',   'income', '💰', NULL),
  (9, 'โบนัส',      'income', '🎁', NULL),
  (10,'อื่นๆ',       'income', '💵', NULL);
