import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import type { Env, AppVariables } from '../types';

type OverlapRow = { count: number };
type RecurringRow = {
  id: number;
  patient_name: string;
  patient_email: string;
  patient_phone: string;
  frequency_weeks: number;
  start_date: string;
  time: string;
  active: number;
  created_at: string;
  next_appointment: string | null;
};
type MaxDateRow = { max_date: string | null };
type SlotIdRow = { id: number };
type ConfigRow = { session_duration_minutes: number };

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().split('T')[0];
}

function isValidDate(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(new Date(dateStr).getTime());
}

function isValidTime(timeStr: string): boolean {
  return /^\d{2}:\d{2}$/.test(timeStr);
}

async function generateSlots(
  db: D1Database,
  params: {
    recurringId: number;
    psychologistId: number;
    fromDate: string;
    toDate: string;
    time: string;
    frequencyWeeks: number;
    patientName: string;
    patientEmail: string;
    patientPhone: string;
    sessionDuration: number;
  },
): Promise<{ created: number; skipped: number }> {
  const {
    recurringId,
    psychologistId,
    fromDate,
    toDate,
    time,
    frequencyWeeks,
    patientName,
    patientEmail,
    patientPhone,
    sessionDuration,
  } = params;

  const end_time = addMinutes(time, sessionDuration);
  let created = 0;
  let skipped = 0;
  let current = fromDate;

  while (current <= toDate) {
    const overlap = await db
      .prepare(
        `SELECT COUNT(*) as count FROM slots
         WHERE psychologist_id = ? AND date = ?
         AND NOT (end_time <= ? OR start_time >= ?)`,
      )
      .bind(psychologistId, current, time, end_time)
      .first<OverlapRow>();

    if (!overlap || overlap.count === 0) {
      try {
        const slotResult = await db
          .prepare(
            `INSERT INTO slots (psychologist_id, date, start_time, end_time, recurring_booking_id)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(psychologistId, current, time, end_time, recurringId)
          .run();

        const slotId = slotResult.meta.last_row_id;

        await db
          .prepare(
            `INSERT INTO bookings (slot_id, patient_name, patient_email, patient_phone, recurring_booking_id)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(slotId, patientName, patientEmail, patientPhone, recurringId)
          .run();

        // Mark the slot as unavailable since it's booked
        await db
          .prepare('UPDATE slots SET available = 0 WHERE id = ?')
          .bind(slotId)
          .run();

        created++;
      } catch {
        skipped++;
      }
    } else {
      skipped++;
    }

    current = addDays(current, frequencyWeeks * 7);
  }

  return { created, skipped };
}

export const recurringRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// POST /api/recurring — create recurring booking (admin)
recurringRouter.post('/', authMiddleware, async (c) => {
  const psychologistId = c.get('psychologistId');

  let body: {
    patient_name?: string;
    patient_email?: string;
    patient_phone?: string;
    start_date?: string;
    time?: string;
    frequency_weeks?: number;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Cuerpo JSON inválido' }, 400);
  }

  const { patient_name, patient_email, patient_phone, start_date, time, frequency_weeks } = body;

  if (!patient_name || !patient_email || !patient_phone || !start_date || !time || !frequency_weeks) {
    return c.json(
      {
        success: false,
        error:
          'Campos requeridos: patient_name, patient_email, patient_phone, start_date, time, frequency_weeks',
      },
      400,
    );
  }
  if (!isValidDate(start_date)) {
    return c.json({ success: false, error: 'Formato de fecha inválido (YYYY-MM-DD)' }, 400);
  }
  if (!isValidTime(time)) {
    return c.json({ success: false, error: 'Formato de hora inválido (HH:MM)' }, 400);
  }
  if (![1, 2, 3, 4].includes(frequency_weeks)) {
    return c.json({ success: false, error: 'frequency_weeks debe ser 1, 2, 3 o 4' }, 400);
  }

  const recurringResult = await c.env.DB.prepare(
    `INSERT INTO recurring_bookings
       (psychologist_id, patient_name, patient_email, patient_phone, frequency_weeks, start_date, time)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(psychologistId, patient_name, patient_email, patient_phone, frequency_weeks, start_date, time)
    .run();

  const recurringId = recurringResult.meta.last_row_id;
  const toDate = addMonths(todayStr(), 3);

  const config = await c.env.DB.prepare('SELECT session_duration_minutes FROM psychologists WHERE id = ?')
    .bind(psychologistId)
    .first<ConfigRow>();
  const sessionDuration = config?.session_duration_minutes ?? 45;

  const { created, skipped } = await generateSlots(c.env.DB, {
    recurringId,
    psychologistId,
    fromDate: start_date,
    toDate,
    time,
    frequencyWeeks: frequency_weeks,
    patientName: patient_name,
    patientEmail: patient_email,
    patientPhone: patient_phone,
    sessionDuration,
  });

  const record = await c.env.DB.prepare('SELECT * FROM recurring_bookings WHERE id = ?')
    .bind(recurringId)
    .first();

  return c.json({ success: true, data: { recurring_booking: record, slots_created: created, slots_skipped: skipped } }, 201);
});

// GET /api/recurring — list active recurring bookings (admin)
recurringRouter.get('/', authMiddleware, async (c) => {
  const psychologistId = c.get('psychologistId');

  const result = await c.env.DB.prepare(
    `SELECT rb.id, rb.patient_name, rb.patient_email, rb.patient_phone,
            rb.frequency_weeks, rb.start_date, rb.time, rb.active, rb.created_at,
            MIN(s.date) as next_appointment
     FROM recurring_bookings rb
     LEFT JOIN slots s ON s.recurring_booking_id = rb.id AND s.date >= date('now')
     WHERE rb.psychologist_id = ? AND rb.active = 1
     GROUP BY rb.id
     ORDER BY rb.start_date`,
  )
    .bind(psychologistId)
    .all<RecurringRow>();

  return c.json({ success: true, data: result.results });
});

// DELETE /api/recurring/:id — cancel entire recurrence (admin)
recurringRouter.delete('/:id', authMiddleware, async (c) => {
  const psychologistId = c.get('psychologistId');
  const id = Number(c.req.param('id'));

  const recurring = await c.env.DB.prepare(
    'SELECT id FROM recurring_bookings WHERE id = ? AND psychologist_id = ? AND active = 1',
  )
    .bind(id, psychologistId)
    .first();

  if (!recurring) {
    return c.json({ success: false, error: 'Recurrencia no encontrada' }, 404);
  }

  const today = todayStr();

  // Get future slot IDs linked to this recurrence
  const futureSlots = await c.env.DB.prepare(
    `SELECT id FROM slots WHERE recurring_booking_id = ? AND date > ?`,
  )
    .bind(id, today)
    .all<SlotIdRow>();

  const slotIds = futureSlots.results.map((s) => s.id);

  if (slotIds.length > 0) {
    // Delete future bookings first (FK), then slots, in batches
    const batchSize = 50;
    for (let i = 0; i < slotIds.length; i += batchSize) {
      const chunk = slotIds.slice(i, i + batchSize);
      const placeholders = chunk.map(() => '?').join(', ');
      await c.env.DB.prepare(`DELETE FROM bookings WHERE slot_id IN (${placeholders})`)
        .bind(...chunk)
        .run();
      await c.env.DB.prepare(`DELETE FROM slots WHERE id IN (${placeholders})`)
        .bind(...chunk)
        .run();
    }
  }

  await c.env.DB.prepare('UPDATE recurring_bookings SET active = 0 WHERE id = ?').bind(id).run();

  return c.json({ success: true, data: { slots_deleted: slotIds.length } });
});

// POST /api/recurring/extend — generate missing future slots for all active recurrences (admin)
recurringRouter.post('/extend', authMiddleware, async (c) => {
  const psychologistId = c.get('psychologistId');
  const horizon = addMonths(todayStr(), 3);

  const recurrences = await c.env.DB.prepare(
    `SELECT rb.id, rb.patient_name, rb.patient_email, rb.patient_phone,
            rb.frequency_weeks, rb.start_date, rb.time,
            MAX(s.date) as last_generated
     FROM recurring_bookings rb
     LEFT JOIN slots s ON s.recurring_booking_id = rb.id
     WHERE rb.psychologist_id = ? AND rb.active = 1
     GROUP BY rb.id`,
  )
    .bind(psychologistId)
    .all<RecurringRow & { last_generated: string | null }>();

  const config = await c.env.DB.prepare('SELECT session_duration_minutes FROM psychologists WHERE id = ?')
    .bind(psychologistId)
    .first<ConfigRow>();
  const sessionDuration = config?.session_duration_minutes ?? 45;

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const rec of recurrences.results) {
    const lastDate = rec.last_generated ?? rec.start_date;
    const fromDate = addDays(lastDate, rec.frequency_weeks * 7);

    if (fromDate > horizon) continue;

    const { created, skipped } = await generateSlots(c.env.DB, {
      recurringId: rec.id,
      psychologistId,
      fromDate,
      toDate: horizon,
      time: rec.time,
      frequencyWeeks: rec.frequency_weeks,
      patientName: rec.patient_name,
      patientEmail: rec.patient_email,
      patientPhone: rec.patient_phone,
      sessionDuration,
    });

    totalCreated += created;
    totalSkipped += skipped;
  }

  return c.json({ success: true, data: { slots_created: totalCreated, slots_skipped: totalSkipped } });
});
