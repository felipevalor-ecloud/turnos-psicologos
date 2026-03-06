import { Hono } from 'hono';
import { verifyPassword } from '../lib/password';
import { signJWT } from '../lib/jwt';
import { authMiddleware } from '../middleware/auth';
import type { Env, AppVariables } from '../types';

type PsychologistRow = {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  session_duration_minutes: number;
};

export const authRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// GET /api/auth/me
authRouter.get('/me', authMiddleware, async (c) => {
  const psychologistId = c.get('psychologistId');

  const psych = await c.env.DB.prepare(
    'SELECT id, name, email, session_duration_minutes FROM psychologists WHERE id = ?',
  )
    .bind(psychologistId)
    .first<Omit<PsychologistRow, 'password_hash'>>();

  if (!psych) {
    return c.json({ success: false, error: 'Psicólogo no encontrado' }, 404);
  }

  return c.json({ success: true, data: psych });
});

// PATCH /api/auth/me
authRouter.patch('/me', authMiddleware, async (c) => {
  const psychologistId = c.get('psychologistId');

  let body: { session_duration_minutes?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Cuerpo JSON inválido' }, 400);
  }

  const { session_duration_minutes } = body;

  if (session_duration_minutes !== undefined) {
    if (![30, 45, 50, 60].includes(session_duration_minutes)) {
      return c.json(
        { success: false, error: 'La duración debe ser 30, 45, 50 o 60 minutos' },
        400,
      );
    }

    await c.env.DB.prepare(
      'UPDATE psychologists SET session_duration_minutes = ? WHERE id = ?',
    )
      .bind(session_duration_minutes, psychologistId)
      .run();
  }

  const psych = await c.env.DB.prepare(
    'SELECT id, name, email, session_duration_minutes FROM psychologists WHERE id = ?',
  )
    .bind(psychologistId)
    .first<Omit<PsychologistRow, 'password_hash'>>();

  return c.json({ success: true, data: psych });
});

authRouter.post('/login', async (c) => {
  let body: { email?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Cuerpo JSON inválido' }, 400);
  }

  const { email, password } = body;

  if (!email || !password) {
    return c.json({ success: false, error: 'Email y contraseña requeridos' }, 400);
  }

  const psych = await c.env.DB.prepare(
    'SELECT id, name, email, password_hash, session_duration_minutes FROM psychologists WHERE email = ?',
  )
    .bind(email)
    .first<PsychologistRow>();

  if (!psych) {
    return c.json({ success: false, error: 'Credenciales inválidas' }, 401);
  }

  const valid = await verifyPassword(password, psych.password_hash);
  if (!valid) {
    return c.json({ success: false, error: 'Credenciales inválidas' }, 401);
  }

  const now = Math.floor(Date.now() / 1000);
  const token = await signJWT(
    { sub: psych.id, email: psych.email, iat: now, exp: now + 8 * 3600 },
    c.env.JWT_SECRET,
  );

  return c.json({
    success: true,
    data: {
      token,
      psychologist: { 
        id: psych.id, 
        name: psych.name, 
        email: psych.email,
        session_duration_minutes: psych.session_duration_minutes
      },
    },
  });
});

authRouter.post('/logout', (c) => {
  return c.json({ success: true });
});
