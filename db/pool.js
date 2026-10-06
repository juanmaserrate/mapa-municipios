// Conexión a Postgres. Railway inyecta DATABASE_URL solo.
const { Pool } = require('pg');

const hayBase = !!process.env.DATABASE_URL;

const pool = hayBase
    ? new Pool({
          connectionString: process.env.DATABASE_URL,
          // Railway usa certificados propios dentro de su red
          ssl: process.env.DATABASE_URL.includes('railway.internal')
              ? false
              : { rejectUnauthorized: false },
          max: 5,
          idleTimeoutMillis: 30000
      })
    : null;

async function consultar(sql, params) {
    if (!pool) throw new Error('No hay base de datos configurada (falta DATABASE_URL)');
    const res = await pool.query(sql, params);
    return res.rows;
}

// Varias escrituras que tienen que entrar todas o ninguna
async function enTransaccion(fn) {
    if (!pool) throw new Error('No hay base de datos configurada (falta DATABASE_URL)');
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        const resultado = await fn(cliente);
        await cliente.query('COMMIT');
        return resultado;
    } catch (e) {
        await cliente.query('ROLLBACK');
        throw e;
    } finally {
        cliente.release();
    }
}

module.exports = { pool, consultar, enTransaccion, hayBase };
