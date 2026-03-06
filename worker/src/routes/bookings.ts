import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import type { Env, AppVariables } from '../types';

type SlotBookingRow = {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  available: number;
  booking_id: number | null;
};

type BookingRow = {
  id: number;
  patient_email: string;
  patient_phone: string;
  slot_id: number;
  date: string;
  start_time: string;
};

const PHONE_RE = /^\+549\d{8,10}$/;

export const bookingsRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// GET /api/bookings  — admin
bookingsRouter.get('/', authMiddleware, async (c) => {
  const psychologistId = c.get('psychologistId');

  const result = await c.env.DB.prepare(
    `SELECT b.id, b.patient_name, b.patient_email, b.patient_phone, b.created_at,
            s.id as slot_id, s.date, s.start_time, s.end_time
     FROM bookings b
     JOIN slots s ON b.slot_id = s.id
     WHERE s.psychologist_id = ?
     ORDER BY s.date, s.start_time`,
  )
    .bind(psychologistId)
    .all();

  return c.json({ success: true, data: result.results });
});

// POST /api/bookings  — public
bookingsRouter.post('/', async (c) => {
  let body: {
    slot_id?: number;
    patient_name?: string;
    patient_email?: string;
    patient_phone?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Cuerpo JSON inválido' }, 400);
  }

  const { slot_id, patient_name, patient_email, patient_phone } = body;

  if (!slot_id || !patient_name || !patient_email || !patient_phone) {
    return c.json({ success: false, error: 'Todos los campos son requeridos' }, 400);
  }
  if (!PHONE_RE.test(patient_phone)) {
    return c.json(
      { success: false, error: 'Formato de teléfono inválido. Use +5491112345678' },
      400,
    );
  }

  // Fetch slot with booking status
  const slot = await c.env.DB.prepare(
    `SELECT s.id, s.date, s.start_time, s.end_time, s.available, b.id as booking_id
     FROM slots s
     LEFT JOIN bookings b ON b.slot_id = s.id
     WHERE s.id = ?`,
  )
    .bind(slot_id)
    .first<SlotBookingRow>();

  if (!slot) {
    return c.json({ success: false, error: 'Turno no encontrado' }, 404);
  }
  if (!slot.available || slot.booking_id !== null) {
    return c.json({ success: false, error: 'El turno no está disponible' }, 409);
  }

  // Check patient doesn't have an overlapping booking on the same date
  const overlap = await c.env.DB.prepare(
    `SELECT b.id FROM bookings b
     JOIN slots s ON b.slot_id = s.id
     WHERE b.patient_email = ? AND s.date = ?
     AND NOT (s.end_time <= ? OR s.start_time >= ?)`,
  )
    .bind(patient_email, slot.date, slot.start_time, slot.end_time)
    .first();

  if (overlap) {
    return c.json({ success: false, error: 'Ya tenés una reserva en ese horario' }, 409);
  }

  // Atomically set available=0 and insert booking using D1 batch
  const results = await c.env.DB.batch([
    c.env.DB.prepare('UPDATE slots SET available = 0 WHERE id = ? AND available = 1').bind(slot_id),
    c.env.DB.prepare(
      'INSERT INTO bookings (slot_id, patient_name, patient_email, patient_phone) VALUES (?, ?, ?, ?)',
    ).bind(slot_id, patient_name, patient_email, patient_phone),
  ]);

  // If UPDATE affected 0 rows, someone else booked first (race condition)
  if (results[0].meta.changes === 0) {
    return c.json({ success: false, error: 'El turno ya no está disponible' }, 409);
  }

  const bookingId = results[1].meta.last_row_id;

  return c.json(
    {
      success: true,
      data: {
        id: bookingId,
        slot: { date: slot.date, start_time: slot.start_time, end_time: slot.end_time },
        patient: { name: patient_name, email: patient_email, phone: patient_phone },
      },
    },
    201,
  );
});

// POST /api/bookings/search  — public (find patient's own bookings)
bookingsRouter.post('/search', async (c) => {
  let body: { email?: string; phone?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Cuerpo JSON inválido' }, 400);
  }

  const { email, phone } = body;
  if (!email || !phone) {
    return c.json({ success: false, error: 'Email y teléfono requeridos' }, 400);
  }

  const result = await c.env.DB.prepare(
    `SELECT b.id, b.patient_name, b.patient_email, b.patient_phone, b.created_at,
            s.id as slot_id, s.date, s.start_time, s.end_time
     FROM bookings b
     JOIN slots s ON b.slot_id = s.id
     WHERE b.patient_email = ? AND b.patient_phone = ?
     AND s.date >= date('now')
     ORDER BY s.date, s.start_time`,
  )
    .bind(email, phone)
    .all();

  return c.json({ success: true, data: result.results });
});

// DELETE /api/bookings/:id  — public, requires email+phone verification
bookingsRouter.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));

  let body: { email?: string; phone?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Cuerpo JSON inválido' }, 400);
  }

  const { email, phone } = body;
  if (!email || !phone) {
    return c.json({ success: false, error: 'Email y teléfono requeridos para cancelar' }, 400);
  }

  const booking = await c.env.DB.prepare(
    `SELECT b.id, b.patient_email, b.patient_phone, b.slot_id, s.date, s.start_time
     FROM bookings b
     JOIN slots s ON b.slot_id = s.id
     WHERE b.id = ?`,
  )
    .bind(id)
    .first<BookingRow>();

  if (!booking) {
    return c.json({ success: false, error: 'Reserva no encontrada' }, 404);
  }
  if (booking.patient_email !== email || booking.patient_phone !== phone) {
    return c.json({ success: false, error: 'Datos de verificación incorrectos' }, 403);
  }

  // Enforce 24h cancellation policy
  const appointmentDate = new Date(`${booking.date}T${booking.start_time}:00Z`);
  const hoursUntil = (appointmentDate.getTime() - Date.now()) / (1000 * 3600);
  if (hoursUntil < 24) {
    return c.json(
      {
        success: false,
        error: 'Las cancelaciones deben realizarse con al menos 24 horas de anticipación',
      },
      400,
    );
  }

  // Delete booking and restore slot
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM bookings WHERE id = ?').bind(id),
    c.env.DB.prepare('UPDATE slots SET available = 1 WHERE id = ?').bind(booking.slot_id),
  ]);

  return c.json({ success: true });
});
