CREATE TABLE psicologos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  session_duration_minutes INTEGER DEFAULT 45,
  cancel_min_hours INTEGER NOT NULL DEFAULT 48,
  reschedule_min_hours INTEGER NOT NULL DEFAULT 48,
  booking_min_hours INTEGER NOT NULL DEFAULT 24,
  whatsapp_number TEXT,
  policy_unit TEXT NOT NULL DEFAULT 'hours'
);

CREATE TABLE slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  psicologo_id INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  hora_inicio TEXT NOT NULL,
  hora_fin TEXT NOT NULL,
  disponible INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (psicologo_id) REFERENCES psicologos(id)
);

CREATE TABLE reservas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_id INTEGER NOT NULL,
  paciente_nombre TEXT NOT NULL,
  paciente_email TEXT NOT NULL,
  paciente_telefono TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (slot_id) REFERENCES slots(id)
);

CREATE TABLE weekly_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  psychologist_id INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL, -- 0=Sunday, 1=Monday, ..., 6=Saturday
  start_time TIME NOT NULL,     -- e.g. "09:00"
  end_time TIME NOT NULL,       -- e.g. "18:00"
  active INTEGER DEFAULT 1,     -- 1 = works this day, 0 = doesn't work
  FOREIGN KEY (psychologist_id) REFERENCES psicologos(id),
  UNIQUE(psychologist_id, day_of_week)
);

CREATE TABLE holiday_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  psychologist_id INTEGER NOT NULL,
  date DATE NOT NULL,           -- the holiday date to unblock
  FOREIGN KEY (psychologist_id) REFERENCES psicologos(id),
  UNIQUE(psychologist_id, date)
);

CREATE TABLE recurring_bookings (
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

-- Indexes for performance (added to reduce D1 row reads)

-- slots table
CREATE INDEX IF NOT EXISTS idx_slots_fecha ON slots(fecha);
CREATE INDEX IF NOT EXISTS idx_slots_psicologo_id ON slots(psicologo_id);
CREATE INDEX IF NOT EXISTS idx_slots_psicologo_fecha ON slots(psicologo_id, fecha);
CREATE INDEX IF NOT EXISTS idx_slots_disponible ON slots(disponible);

-- reservas table
CREATE INDEX IF NOT EXISTS idx_reservas_slot_id ON reservas(slot_id);
CREATE INDEX IF NOT EXISTS idx_reservas_paciente_email ON reservas(paciente_email);

-- recurring_bookings table
CREATE INDEX IF NOT EXISTS idx_recurring_psychologist_id ON recurring_bookings(psychologist_id);
CREATE INDEX IF NOT EXISTS idx_recurring_active ON recurring_bookings(active);

-- weekly_schedule table
CREATE INDEX IF NOT EXISTS idx_weekly_psychologist_id ON weekly_schedule(psychologist_id);
