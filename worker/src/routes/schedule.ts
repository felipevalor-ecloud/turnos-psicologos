import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import type { Env, AppVariables } from '../types';

export const scheduleRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

type WeeklyScheduleItem = {
    day_of_week: number;
    start_time: string;
    end_time: string;
    active: number;
};

// GET /api/schedule
scheduleRouter.get('/', authMiddleware, async (c) => {
    const psychologistId = c.get('psychologistId');

    const result = await c.env.DB.prepare(
        'SELECT day_of_week, start_time, end_time, active FROM weekly_schedule WHERE psychologist_id = ? ORDER BY day_of_week ASC'
    ).bind(psychologistId).all<WeeklyScheduleItem>();

    return c.json({ success: true, data: result.results });
});

// PUT /api/schedule
scheduleRouter.put('/', authMiddleware, async (c) => {
    const psychologistId = c.get('psychologistId');

    let body: { schedule?: WeeklyScheduleItem[] };
    try {
        body = await c.req.json();
    } catch {
        return c.json({ success: false, error: 'Cuerpo JSON inválido' }, 400);
    }

    const { schedule } = body;

    if (!Array.isArray(schedule) || schedule.length === 0) {
        return c.json({ success: false, error: 'Se requiere un arreglo de horarios válido' }, 400);
    }

    // Basic validation
    for (const item of schedule) {
        if (
            typeof item.day_of_week !== 'number' ||
            item.day_of_week < 0 ||
            item.day_of_week > 6 ||
            !item.start_time ||
            !item.end_time ||
            (item.active !== 0 && item.active !== 1)
        ) {
            return c.json({ success: false, error: 'Formato de horario inválido' }, 400);
        }
        if (item.start_time >= item.end_time) {
            return c.json({ success: false, error: 'La hora de inicio debe ser anterior a la de fin' }, 400);
        }
    }

    try {
        // We can just delete old and insert new, or use UPSERT
        // SQLite supports UPSERT but delete + insert is easier for arrays
        await c.env.DB.prepare('DELETE FROM weekly_schedule WHERE psychologist_id = ?')
            .bind(psychologistId).run();

        const stmt = c.env.DB.prepare(
            'INSERT INTO weekly_schedule (psychologist_id, day_of_week, start_time, end_time, active) VALUES (?, ?, ?, ?, ?)'
        );

        const batchArgs = schedule.map(item =>
            stmt.bind(psychologistId, item.day_of_week, item.start_time, item.end_time, item.active)
        );

        await c.env.DB.batch(batchArgs);

        return c.json({ success: true });
    } catch (error) {
        console.error(error);
        return c.json({ success: false, error: 'Error al guardar el horario semanal' }, 500);
    }
});
