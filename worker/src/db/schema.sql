CREATE TABLE IF NOT EXISTS psychologists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  session_duration_minutes INTEGER DEFAULT 45,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recurring_bookings (
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
  FOREIGN KEY (psychologist_id) REFERENCES psychologists(id)
);

CREATE TABLE IF NOT EXISTS slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  psychologist_id INTEGER NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  available INTEGER DEFAULT 1,
  recurring_booking_id INTEGER REFERENCES recurring_bookings(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (psychologist_id) REFERENCES psychologists(id),
  UNIQUE(psychologist_id, date, start_time)
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_id INTEGER NOT NULL UNIQUE,
  patient_name TEXT NOT NULL,
  patient_email TEXT NOT NULL,
  patient_phone TEXT NOT NULL,
  recurring_booking_id INTEGER REFERENCES recurring_bookings(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (slot_id) REFERENCES slots(id)
);
