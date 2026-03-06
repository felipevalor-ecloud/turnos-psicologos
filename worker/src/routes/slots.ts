import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import type { Env, AppVariables } from '../types';

type SlotRow = {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  available: number;
  booking_id: number | null;
};

type OverlapRow = { count: number };
type ConfigRow = { session_duration_minutes: number };

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function todayUTC(): string {
  return new Date().toISOString().split('T')[0];
}

function dateFromUTC(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00Z`);
}

function formatUTC(date: Date): string {
  return date.toISOString().split('T')[0];
}

function isValidDate(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(new Date(dateStr).getTime());
}

function isValidTime(timeStr: string): boolean {
  return /^\d{2}:\d{2}$/.test(timeStr);
}

export const slotsRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// GET /api/slots?date=YYYY-MM-DD  — public
slotsRouter.get('/', async (c) => {
  const date = c.req.query('date');
  if (!date || !isValidDate(date)) {
    return c.json({ success: false, error: 'Fecha inválida. Use formato YYYY-MM-DD' }, 400);
  }

  const result = await c.env.DB.prepare(
    'SELECT id, date, start_time, end_time FROM slots WHERE date = ? AND available = 1 ORDER BY start_time',
  )
    .bind(date)
    .all();

  return c.json({ success: true, data: result.results });
});

// GET /api/slots/all  — admin, with optional filters
slotsRouter.get('/all', authMiddleware, async (c) => {
  const psychologistId = c.get('psychologistId');
  const date = c.req.query('date');
  const status = c.req.query('status');

  let query = `
    SELECT s.id, s.date, s.start_time, s.end_time, s.available, s.created_at, s.recurring_booking_id,
           b.id as booking_id, b.patient_name, b.patient_email, b.patient_phone
    FROM slots s
    LEFT JOIN bookings b ON b.slot_id = s.id
    WHERE s.psychologist_id = ?
  `;
  const params: (string | number)[] = [psychologistId];

  if (date) {
    query += ' AND s.date = ?';
    params.push(date);
  }

  if (status === 'available') {
    query += ' AND s.available = 1 AND b.id IS NULL';
  } else if (status === 'booked') {
    query += ' AND b.id IS NOT NULL';
  } else if (status === 'blocked') {
    query += ' AND s.available = 0 AND b.id IS NULL';
  }

  query += ' ORDER BY s.date, s.start_time';

  const result = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ success: true, data: result.results });
});

// POST /api/slots  — admin, single slot
slotsRouter.post('/', authMiddleware, async (c) => {
  const psychologistId = c.get('psychologistId');

  let body: { date?: string; start_time?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Cuerpo JSON inválido' }, 400);
  }

  const { date, start_time } = body;

  if (!date || !start_time) {
    return c.json({ success: false, error: 'date y start_time son requeridos' }, 400);
  }
  if (!isValidDate(date)) {
    return c.json({ success: false, error: 'Formato de fecha inválido (YYYY-MM-DD)' }, 400);
  }
  if (!isValidTime(start_time)) {
    return c.json({ success: false, error: 'Formato de hora inválido (HH:MM)' }, 400);
  }
  if (date < todayUTC()) {
    return c.json({ success: false, error: 'No se puede crear un turno en una fecha pasada' }, 400);
  }

  const config = await c.env.DB.prepare('SELECT session_duration_minutes FROM psychologists WHERE id = ?')
    .bind(psychologistId)
    .first<ConfigRow>();
  const duration = config?.session_duration_minutes ?? 45;

  const end_time = addMinutes(start_time, duration);

  const overlap = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM slots
     WHERE psychologist_id = ? AND date = ?
     AND NOT (end_time <= ? OR start_time >= ?)`,
  )
    .bind(psychologistId, date, start_time, end_time)
    .first<OverlapRow>();

  if (overlap && overlap.count > 0) {
    return c.json({ success: false, error: 'El turno se superpone con uno existente' }, 409);
  }

  const result = await c.env.DB.prepare(
    'INSERT INTO slots (psychologist_id, date, start_time, end_time) VALUES (?, ?, ?, ?)',
  )
    .bind(psychologistId, date, start_time, end_time)
    .run();

  return c.json(
    { success: true, data: { id: result.meta.last_row_id, date, start_time, end_time, available: 1 } },
    201,
  );
});

// POST /api/slots/batch  — admin, bulk creation
slotsRouter.post('/batch', authMiddleware, async (c) => {
  const psychologistId = c.get('psychologistId');

  let body: { start_date?: string; end_date?: string; start_time?: string; days_of_week?: number[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Cuerpo JSON inválido' }, 400);
  }

  const { start_date, end_date, start_time, days_of_week } = body;

  if (!start_date || !end_date || !start_time || !Array.isArray(days_of_week) || days_of_week.length === 0) {
    return c.json(
      { success: false, error: 'Campos requeridos: start_date, end_date, start_time, days_of_week' },
      400,
    );
  }
  if (!isValidDate(start_date) || !isValidDate(end_date)) {
    return c.json({ success: false, error: 'Formato de fecha inválido' }, 400);
  }
  if (!isValidTime(start_time)) {
    return c.json({ success: false, error: 'Formato de hora inválido (HH:MM)' }, 400);
  }
  if (start_date < todayUTC()) {
    return c.json({ success: false, error: 'La fecha de inicio no puede ser pasada' }, 400);
  }
  if (end_date < start_date) {
    return c.json({ success: false, error: 'end_date debe ser posterior a start_date' }, 400);
  }

  const config = await c.env.DB.prepare('SELECT session_duration_minutes FROM psychologists WHERE id = ?')
    .bind(psychologistId)
    .first<ConfigRow>();
  const duration = config?.session_duration_minutes ?? 45;

  const end_time = addMinutes(start_time, duration);
  const created: string[] = [];
  const skipped: string[] = [];

  const current = dateFromUTC(start_date);
  const endDate = dateFromUTC(end_date);

  while (current <= endDate) {
    const dayOfWeek = current.getUTCDay();
    const dateStr = formatUTC(current);

    if (days_of_week.includes(dayOfWeek)) {
      const overlap = await c.env.DB.prepare(
        `SELECT COUNT(*) as count FROM slots
         WHERE psychologist_id = ? AND date = ?
         AND NOT (end_time <= ? OR start_time >= ?)`,
      )
        .bind(psychologistId, dateStr, start_time, end_time)
        .first<OverlapRow>();

      if (!overlap || overlap.count === 0) {
        try {
          await c.env.DB.prepare(
            'INSERT INTO slots (psychologist_id, date, start_time, end_time) VALUES (?, ?, ?, ?)',
          )
            .bind(psychologistId, dateStr, start_time, end_time)
            .run();
          created.push(dateStr);
        } catch {
          skipped.push(dateStr);
        }
      } else {
        skipped.push(dateStr);
      }
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return c.json(
    { success: true, data: { created: created.length, skipped: skipped.length, dates: created } },
    201,
  );
});

// PATCH /api/slots/:id  — admin, block/unblock
slotsRouter.patch('/:id', authMiddleware, async (c) => {
  const psychologistId = c.get('psychologistId');
  const id = Number(c.req.param('id'));

  let body: { available?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Cuerpo JSON inválido' }, 400);
  }

  const { available } = body;
  if (available !== 0 && available !== 1) {
    return c.json({ success: false, error: 'available debe ser 0 o 1' }, 400);
  }

  const slot = await c.env.DB.prepare(
    `SELECT s.id, s.available, b.id as booking_id
     FROM slots s
     LEFT JOIN bookings b ON b.slot_id = s.id
     WHERE s.id = ? AND s.psychologist_id = ?`,
  )
    .bind(id, psychologistId)
    .first<SlotRow>();

  if (!slot) {
    return c.json({ success: false, error: 'Turno no encontrado' }, 404);
  }
  if (available === 0 && slot.booking_id !== null) {
    return c.json({ success: false, error: 'No se puede bloquear un turno con reserva activa' }, 409);
  }

  await c.env.DB.prepare('UPDATE slots SET available = ? WHERE id = ?').bind(available, id).run();

  return c.json({ success: true });
});

// DELETE /api/slots/:id  — admin
slotsRouter.delete('/:id', authMiddleware, async (c) => {
  const psychologistId = c.get('psychologistId');
  const id = Number(c.req.param('id'));

  const slot = await c.env.DB.prepare(
    `SELECT s.id, b.id as booking_id
     FROM slots s
     LEFT JOIN bookings b ON b.slot_id = s.id
     WHERE s.id = ? AND s.psychologist_id = ?`,
  )
    .bind(id, psychologistId)
    .first<SlotRow>();

  if (!slot) {
    return c.json({ success: false, error: 'Turno no encontrado' }, 404);
  }
  if (slot.booking_id !== null) {
    return c.json({ success: false, error: 'No se puede eliminar un turno con reserva activa' }, 409);
  }

  await c.env.DB.prepare('DELETE FROM slots WHERE id = ?').bind(id).run();

  return c.json({ success: true });
});
