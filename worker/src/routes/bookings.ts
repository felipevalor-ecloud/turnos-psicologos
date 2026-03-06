import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { verifyJWT } from '../lib/jwt';
import type { Env, AppVariables } from '../types';

type SlotBookingRow = {
  id: number;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  disponible: number;
  booking_id: number | null;
};

type BookingRow = {
  id: number;
  paciente_email: string;
  paciente_telefono: string;
  slot_id: number;
  fecha: string;
  hora_inicio: string;
};

const PHONE_RE = /^\+549\d{8,10}$/;

export const bookingsRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// GET /api/bookings  — admin
bookingsRouter.get('/', authMiddleware, async (c) => {
  const psychologistId = c.get('psychologistId');

  const result = await c.env.DB.prepare(
    `SELECT b.id, b.paciente_nombre as patient_name, b.paciente_email as patient_email, b.paciente_telefono as patient_phone, b.created_at,
            s.id as slot_id, s.fecha as date, s.hora_inicio as start_time, s.hora_fin as end_time
     FROM reservas b
     JOIN slots s ON b.slot_id = s.id
     WHERE s.psicologo_id = ?
     ORDER BY s.fecha, s.hora_inicio`,
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
    `SELECT s.id, s.fecha, s.hora_inicio, s.hora_fin, s.disponible, b.id as booking_id
     FROM slots s
     LEFT JOIN reservas b ON b.slot_id = s.id
     WHERE s.id = ?`,
  )
    .bind(slot_id)
    .first<SlotBookingRow>();

  if (!slot) {
    return c.json({ success: false, error: 'Turno no encontrado' }, 404);
  }
  if (!slot.disponible || slot.booking_id !== null) {
    return c.json({ success: false, error: 'El turno no está disponible' }, 409);
  }

  let isPsychologist = false;
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = await verifyJWT(token, c.env.JWT_SECRET);
    if (payload) {
      isPsychologist = true;
    }
  }

  // Check patient doesn't have an overlapping booking on the same date (unless admin)
  if (!isPsychologist) {
    const overlap = await c.env.DB.prepare(
      `SELECT b.id FROM reservas b
       JOIN slots s ON b.slot_id = s.id
       WHERE b.paciente_email = ? AND s.fecha = ?
       AND NOT (s.hora_fin <= ? OR s.hora_inicio >= ?)`
    )
      .bind(patient_email, slot.fecha, slot.hora_inicio, slot.hora_fin)
      .first();

    if (overlap) {
      return c.json({ success: false, error: 'Ya tenés una reserva en ese horario' }, 409);
    }
  }

  // Atomically set disponible=0 and insert booking using D1 batch
  const results = await c.env.DB.batch([
    c.env.DB.prepare('UPDATE slots SET disponible = 0 WHERE id = ? AND disponible = 1').bind(slot_id),
    c.env.DB.prepare(
      'INSERT INTO reservas (slot_id, paciente_nombre, paciente_email, paciente_telefono) VALUES (?, ?, ?, ?)',
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
        slot: { date: slot.fecha, start_time: slot.hora_inicio, end_time: slot.hora_fin },
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
    `SELECT b.id, b.paciente_nombre as patient_name, b.paciente_email as patient_email, b.paciente_telefono as patient_phone, b.created_at, b.recurring_booking_id,
            s.id as slot_id, s.fecha as date, s.hora_inicio as start_time, s.hora_fin as end_time
     FROM reservas b
     JOIN slots s ON b.slot_id = s.id
     WHERE b.paciente_email = ? AND b.paciente_telefono = ?
     AND s.fecha >= date('now')
     ORDER BY s.fecha, s.hora_inicio`,
  )
    .bind(email, phone)
    .all();

  return c.json({ success: true, data: result.results });
});

// PATCH /api/bookings/:id — reschedule one-off or single recurring instance
bookingsRouter.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  let body: { email?: string; phone?: string; new_slot_id?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Cuerpo JSON inválido' }, 400);
  }

  const { email, phone, new_slot_id } = body;
  if (!email || !phone || !new_slot_id) {
    return c.json({ success: false, error: 'Email, teléfono y nuevo turno son requeridos' }, 400);
  }

  // 1. Validate old booking
  const oldBooking = await c.env.DB.prepare(
    `SELECT b.id, b.paciente_email, b.paciente_telefono, b.paciente_nombre, b.slot_id, b.recurring_booking_id
     FROM reservas b
     WHERE b.id = ?`,
  )
    .bind(id)
    .first<BookingRow & { paciente_nombre: string; recurring_booking_id: number | null }>();

  if (!oldBooking) {
    return c.json({ success: false, error: 'Reserva no encontrada' }, 404);
  }
  if (oldBooking.paciente_email !== email || oldBooking.paciente_telefono !== phone) {
    return c.json({ success: false, error: 'Datos de verificación incorrectos' }, 403);
  }

  // 2. Validate new slot
  const newSlot = await c.env.DB.prepare(
    `SELECT s.id, s.fecha, s.hora_inicio, s.hora_fin, s.disponible, b.id as booking_id
     FROM slots s
     LEFT JOIN reservas b ON b.slot_id = s.id
     WHERE s.id = ?`,
  )
    .bind(new_slot_id)
    .first<SlotBookingRow>();

  if (!newSlot) {
    return c.json({ success: false, error: 'El nuevo turno no existe' }, 404);
  }
  if (!newSlot.disponible || newSlot.booking_id !== null) {
    return c.json({ success: false, error: 'Este turno ya no está disponible, por favor elegí otro' }, 409);
  }

  // 3. Check for conflicts with patient's other bookings (excluding the one being rescheduled)
  const conflict = await c.env.DB.prepare(
    `SELECT b.id FROM reservas b
     JOIN slots s ON b.slot_id = s.id
     WHERE b.paciente_email = ? AND s.fecha = ? AND b.id != ?
     AND NOT (s.hora_fin <= ? OR s.hora_inicio >= ?)`,
  )
    .bind(email, newSlot.fecha, id, newSlot.hora_inicio, newSlot.hora_fin)
    .first();

  if (conflict) {
    return c.json({ success: false, error: 'Ya tenés una reserva en ese horario' }, 409);
  }

  // 4. Atomic swap in D1 batch
  // New booking will have recurring_booking_id = NULL if it was a recurring instance
  try {
    const results = await c.env.DB.batch([
      // Free old slot
      c.env.DB.prepare('UPDATE slots SET disponible = 1 WHERE id = ?').bind(oldBooking.slot_id),
      // Delete old booking
      c.env.DB.prepare('DELETE FROM reservas WHERE id = ?').bind(id),
      // Book new slot (with race condition check)
      c.env.DB.prepare('UPDATE slots SET disponible = 0 WHERE id = ? AND disponible = 1').bind(new_slot_id),
      // Create new booking (recurring_booking_id is NULL by default in this query)
      c.env.DB.prepare(
        'INSERT INTO reservas (slot_id, paciente_nombre, paciente_email, paciente_telefono, recurring_booking_id) VALUES (?, ?, ?, ?, NULL)',
      ).bind(new_slot_id, oldBooking.paciente_nombre, email, phone),
    ]);

    if (results[2].meta.changes === 0) {
      return c.json({ success: false, error: 'Este turno ya no está disponible, por favor elegí otro' }, 409);
    }

    const newBookingId = results[3].meta.last_row_id;
    return c.json({
      success: true,
      data: {
        id: newBookingId,
        slot: { date: newSlot.fecha, start_time: newSlot.hora_inicio, end_time: newSlot.hora_fin },
      }
    });
  } catch (e) {
    return c.json({ success: false, error: 'Error al reprogramar el turno' }, 500);
  }
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
    `SELECT b.id, b.paciente_email, b.paciente_telefono, b.slot_id, s.fecha, s.hora_inicio
     FROM reservas b
     JOIN slots s ON b.slot_id = s.id
     WHERE b.id = ?`,
  )
    .bind(id)
    .first<BookingRow>();

  if (!booking) {
    return c.json({ success: false, error: 'Reserva no encontrada' }, 404);
  }
  if (booking.paciente_email !== email || booking.paciente_telefono !== phone) {
    return c.json({ success: false, error: 'Datos de verificación incorrectos' }, 403);
  }

  /* 
     REMOVED 24h RESTRICTION per requirements:
     "No 24h restriction — patient can cancel at any time"
  */

  // Delete booking and restore slot
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM reservas WHERE id = ?').bind(id),
    c.env.DB.prepare('UPDATE slots SET disponible = 1 WHERE id = ?').bind(booking.slot_id),
  ]);

  return c.json({ success: true });
});
