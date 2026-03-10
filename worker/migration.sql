PRAGMA foreign_keys=OFF;

-- 1. Create new weekly_schedule table
CREATE TABLE new_weekly_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  psychologist_id INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL, -- 0=Sunday, 1=Monday, ..., 6=Saturday
  start_time TIME NOT NULL,     -- e.g. "09:00"
  end_time TIME NOT NULL,       -- e.g. "18:00"
  active INTEGER DEFAULT 1,     -- 1 = works this day, 0 = doesn't work
  FOREIGN KEY (psychologist_id) REFERENCES psicologos(id),
  UNIQUE(psychologist_id, day_of_week)
);
INSERT INTO new_weekly_schedule SELECT * FROM weekly_schedule;
DROP TABLE weekly_schedule;
ALTER TABLE new_weekly_schedule RENAME TO weekly_schedule;
CREATE INDEX IF NOT EXISTS idx_weekly_psychologist_id ON weekly_schedule(psychologist_id);

-- 2. Create new holiday_overrides table
CREATE TABLE new_holiday_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  psychologist_id INTEGER NOT NULL,
  date DATE NOT NULL,           -- the holiday date to unblock
  FOREIGN KEY (psychologist_id) REFERENCES psicologos(id),
  UNIQUE(psychologist_id, date)
);
INSERT INTO new_holiday_overrides SELECT * FROM holiday_overrides;
DROP TABLE holiday_overrides;
ALTER TABLE new_holiday_overrides RENAME TO holiday_overrides;

-- 3. Create new recurring_bookings table
CREATE TABLE new_recurring_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  psychologist_id INTEGER NOT NULL,
  patient_name TEXT NOT NULL,
  patient_email TEXT NOT NULL,
  patient_phone TEXT NOT NULL,
  frequency_weeks INTEGER NOT NULL,
  start_date DATE NOT NULL,
  time TIME NOT NULL,
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (psychologist_id) REFERENCES psicologos(id)
);
INSERT INTO new_recurring_bookings SELECT * FROM recurring_bookings;
DROP TABLE recurring_bookings;
ALTER TABLE new_recurring_bookings RENAME TO recurring_bookings;
CREATE INDEX IF NOT EXISTS idx_recurring_psychologist_id ON recurring_bookings(psychologist_id);
CREATE INDEX IF NOT EXISTS idx_recurring_active ON recurring_bookings(active);


-- 4. Drop legacy tables
DROP TABLE psychologists;
DROP TABLE bookings;

PRAGMA foreign_keys=ON;
