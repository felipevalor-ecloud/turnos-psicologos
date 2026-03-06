-- Weekly schedule: one row per day of week per psychologist
CREATE TABLE weekly_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  psychologist_id INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL, -- 0=Sunday, 1=Monday, ..., 6=Saturday
  start_time TIME NOT NULL,     -- e.g. "09:00"
  end_time TIME NOT NULL,       -- e.g. "18:00"
  active INTEGER DEFAULT 1,     -- 1 = works this day, 0 = doesn't work
  FOREIGN KEY (psychologist_id) REFERENCES psychologists(id),
  UNIQUE(psychologist_id, day_of_week)
);

-- Holiday overrides: psychologist can unblock a holiday
CREATE TABLE holiday_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  psychologist_id INTEGER NOT NULL,
  date DATE NOT NULL,           -- the holiday date to unblock
  FOREIGN KEY (psychologist_id) REFERENCES psychologists(id),
  UNIQUE(psychologist_id, date)
);
