import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRouter } from './routes/auth';
import { slotsRouter } from './routes/slots';
import { bookingsRouter } from './routes/bookings';
import { recurringRouter } from './routes/recurring';
import { scheduleRouter } from './routes/schedule';
import { holidaysRouter } from './routes/holidays';
import type { Env, AppVariables } from './types';

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
);

app.route('/api/auth', authRouter);
app.route('/api/slots', slotsRouter);
app.route('/api/bookings', bookingsRouter);
app.route('/api/recurring', recurringRouter);
app.route('/api/schedule', scheduleRouter);
app.route('/api/holidays', holidaysRouter);

app.notFound((c) => c.json({ success: false, error: 'Ruta no encontrada' }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ success: false, error: 'Error interno del servidor' }, 500);
});

export default app;
