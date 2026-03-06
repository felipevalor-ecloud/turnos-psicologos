import { Hono } from 'hono';
import { verifyPassword } from '../lib/password';
import { signJWT } from '../lib/jwt';
import type { Env, AppVariables } from '../types';

type PsychologistRow = {
  id: number;
  name: string;
  email: string;
  password_hash: string;
};

export const authRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

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
    'SELECT id, name, email, password_hash FROM psychologists WHERE email = ?',
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
      psychologist: { id: psych.id, name: psych.name, email: psych.email },
    },
  });
});

authRouter.post('/logout', (c) => {
  return c.json({ success: true });
});
