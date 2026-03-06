import { createMiddleware } from 'hono/factory';
import { verifyJWT } from '../lib/jwt';
import type { Env, AppVariables } from '../types';

export const authMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: AppVariables;
}>(async (c, next) => {
  const authorization = c.req.header('Authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'No autorizado' }, 401);
  }

  const token = authorization.slice(7);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json({ success: false, error: 'Token inválido o expirado' }, 401);
  }

  c.set('psychologistId', payload.sub);
  c.set('psychologistEmail', payload.email);

  await next();
});
