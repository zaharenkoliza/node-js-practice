import express from 'express';
import pg from 'pg';

const pool = new pg.Pool({
    connectionTimeoutMillis: 3000,
    query_timeout: 5000
});

const app = express();
app.use(express.json());

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
})

const port = 3000;
app.listen(port, '127.0.0.1', () => {
    console.log(`API: http://127.0.0.1:${port}`);
});

const rooms = [
    { id: 1, name: 'Первая комната', maxCount: 4 },
    { id: 2, name: 'Вторая комната', maxCount: 2 }
]
let nextId = 3;

app.get('/api/rooms/:id', async (req, res) => {
    const rawId = req.params.id;
    const id = Number(rawId);

    if (!Number.isSafeInteger(id) || id < 0) {
        return res.status(400).json({ error: 'id должен быть быть положительным и целым числом' });
    }

    const { rows } = await pool.query(
        'SELECT id, amount_of_players, status, time_for_move FROM rooms WHERE id = $1',
        [id],
    );
    // console.log('запрос отправлен');
    const room = rows[0];

    // const room = rooms.find((item) => item.id === id);
    if (!room) {
        return res.status(404).json({ error: 'Комната не найдена' });
    }

    res.json(room);
});

app.post('/api/rooms', async (req, res) => {
    const { name, maxCount } = req.body ?? {};

    if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 100 || !Number.isInteger(maxCount) || maxCount < 2 || maxCount > 10) {
        return res.status(400).json({ error: 'name должен быть непустой строкой от 3 до 100 символов, maxCount должен быть числом от 2 до 10' });
    }

    const { rows } = await pool.query(
        'INSERT INTO rooms(amount_of_players, time_for_move) VALUES ($1, $2) RETURNING id, amount_of_players, time_for_move;',
        [maxCount, 60]
    );

    const room = { id: rows[0].id, name: name, maxCount: rows[0].amount_of_players, time_for_move: rows[0].time_for_move  };

    // const room = { id: nextId++, name: name.trim(), maxCount };
    // rooms.push(room);
    res.status(201).location(`/api/rooms/${room.id}`).json(room);
})

app.get('/api/rooms', async (req, res) => {
    const { status } = req.query;

    if (status !== undefined) {
        const { rows } = await pool.query(
            'SELECT id, amount_of_players, status, time_for_move FROM rooms WHERE status = $1 ORDER BY id',
            [status],
        );
        return res.json(rows);
    }

    const { rows } = await pool.query(
        'SELECT id, amount_of_players, status, time_for_move FROM rooms ORDER BY id',
    );
    res.json(rows);
});

app.patch('/api/rooms/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 0) {
        return res.status(400).json({ error: 'id должен быть положительным и целым числом' });
    }

    const { status, timeForMove } = req.body ?? {};
    if (status === undefined && timeForMove === undefined) {
        return res.status(400).json({ error: 'нужно передать status и/или timeForMove' });
    }
    if (status !== undefined && (typeof status !== 'string' || status.trim() === '')) {
        return res.status(400).json({ error: 'status должен быть непустой строкой' });
    }
    if (timeForMove !== undefined && (!Number.isInteger(timeForMove) || timeForMove <= 0)) {
        return res.status(400).json({ error: 'timeForMove должен быть положительным целым числом' });
    }

    const { rows } = await pool.query(
        `UPDATE rooms
         SET status = COALESCE($1, status),
             time_for_move = COALESCE($2, time_for_move)
         WHERE id = $3
         RETURNING id, amount_of_players, status, time_for_move`,
        [status ?? null, timeForMove ?? null, id],
    );

    if (rows.length === 0) {
        return res.status(404).json({ error: 'Комната не найдена' });
    }
    res.json(rows[0]);
});

app.delete('/api/rooms/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 0) {
        return res.status(400).json({ error: 'id должен быть положительным и целым числом' });
    }

    const { rowCount } = await pool.query('DELETE FROM rooms WHERE id = $1', [id]);
    if (rowCount === 0) {
        return res.status(404).json({ error: 'Комната не найдена' });
    }
    res.status(204).end();
});

app.get('/api/stats/rooms', async (req, res) => {
    const { rows } = await pool.query(
        `SELECT status, COUNT(*)::int AS count, AVG(amount_of_players)::float AS avg_players
         FROM rooms
         GROUP BY status
         ORDER BY count DESC`,
    );
    res.json(rows);
});

// app.use((req,res, next) => {
//     console.log('Прошел запрос');
//     next();
// })

// app.get('/hello', )

app.use((req, res) => {
    res.status(404).json({ error: "Маршрут не найден" });
})

app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Некорректный json' });
    }

    console.error(err);
    return res.status(500).json({
        error: 'Внутренняя ошибка сервера'
    })
})