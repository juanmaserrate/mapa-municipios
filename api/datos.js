// API de datos: todo lo que el navegador lee y escribe pasa por acá.
const express = require('express');
const { consultar, enTransaccion } = require('../db/pool');

const router = express.Router();

// El perfil llega en una cabecera. Identifica quién carga, no restringe el acceso
// (decisión del usuario: todos editan, pero queda registrado quién fue).
function perfilDe(req) {
    return {
        id: (req.get('X-Perfil-Id') || '').slice(0, 60) || null,
        nombre: (req.get('X-Perfil-Nombre') || '').slice(0, 120) || null
    };
}

function aInscripcion(fila) {
    return {
        id: fila.id,
        municipioId: fila.municipio_id,
        clienteId: fila.sociedad_id,
        estado: fila.estado,
        descripcion: fila.descripcion || '',
        notas: fila.notas || '',
        fechaAlta: fila.fecha_alta ? fila.fecha_alta.toISOString().slice(0, 10) : '',
        fechaVto: fila.fecha_vto ? fila.fecha_vto.toISOString().slice(0, 10) : '',
        sinVto: !!fila.sin_vto,
        monto: fila.monto === null ? null : Number(fila.monto),
        creadoPor: fila.creado_por,
        creado: fila.creado_en,
        actualizadoPor: fila.actualizado_por,
        actualizado: fila.actualizado_en
    };
}

async function registrar(cliente, perfil, accion, entidad, entidadId, antes, despues) {
    await cliente.query(
        `INSERT INTO auditoria (perfil_id, perfil_nombre, accion, entidad, entidad_id, antes, despues)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [perfil.id, perfil.nombre, accion, entidad, entidadId,
         antes ? JSON.stringify(antes) : null,
         despues ? JSON.stringify(despues) : null]
    );
}

// ---------- Lectura ----------

router.get('/estado', async (req, res) => {
    try {
        const [sociedades, inscripciones, perfiles] = await Promise.all([
            consultar('SELECT * FROM sociedades WHERE activa ORDER BY orden, nombre'),
            consultar('SELECT * FROM inscripciones'),
            consultar('SELECT * FROM perfiles WHERE activo ORDER BY nombre')
        ]);
        res.json({
            clientes: sociedades.map(s => ({ id: s.id, nombre: s.nombre, color: s.color })),
            inscripciones: inscripciones.map(aInscripcion),
            perfiles: perfiles.map(p => ({ id: p.id, nombre: p.nombre, rol: p.rol })),
            servidor: true
        });
    } catch (e) {
        console.error('[api] error leyendo estado:', e.message);
        res.status(500).json({ error: 'No se pudo leer la base: ' + e.message });
    }
});

// ---------- Inscripciones ----------

router.post('/inscripciones', async (req, res) => {
    const perfil = perfilDe(req);
    const b = req.body || {};
    if (!b.municipioId || !b.clienteId || !b.estado) {
        return res.status(400).json({ error: 'Faltan municipio, sociedad o estado' });
    }
    try {
        const guardada = await enTransaccion(async (cliente) => {
            const { rows } = await cliente.query(
                `INSERT INTO inscripciones
                   (id, municipio_id, sociedad_id, estado, descripcion, notas,
                    fecha_alta, fecha_vto, sin_vto, monto, creado_por)
                 VALUES ($1,$2,$3,$4,$5,$6,
                         NULLIF($7,'')::date, NULLIF($8,'')::date, $9, $10, $11)
                 ON CONFLICT (municipio_id, sociedad_id) DO UPDATE SET
                    estado = EXCLUDED.estado,
                    descripcion = EXCLUDED.descripcion,
                    notas = EXCLUDED.notas,
                    fecha_alta = EXCLUDED.fecha_alta,
                    fecha_vto = EXCLUDED.fecha_vto,
                    sin_vto = EXCLUDED.sin_vto,
                    monto = EXCLUDED.monto,
                    actualizado_por = $11,
                    actualizado_en = now()
                 RETURNING *`,
                [b.id || 'ins_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                 b.municipioId, b.clienteId, b.estado, b.descripcion || '', b.notas || '',
                 b.fechaAlta || '', b.fechaVto || '', !!b.sinVto,
                 b.monto === null || b.monto === undefined || b.monto === '' ? null : b.monto,
                 perfil.nombre]
            );
            await registrar(cliente, perfil, 'guardar', 'inscripcion', rows[0].id, null, b);
            return rows[0];
        });
        res.json(aInscripcion(guardada));
    } catch (e) {
        console.error('[api] error guardando inscripción:', e.message);
        res.status(500).json({ error: 'No se pudo guardar: ' + e.message });
    }
});

router.delete('/inscripciones/:id', async (req, res) => {
    const perfil = perfilDe(req);
    try {
        await enTransaccion(async (cliente) => {
            const { rows } = await cliente.query('SELECT * FROM inscripciones WHERE id = $1', [req.params.id]);
            if (!rows.length) return;
            await cliente.query('DELETE FROM inscripciones WHERE id = $1', [req.params.id]);
            await registrar(cliente, perfil, 'borrar', 'inscripcion', req.params.id, aInscripcion(rows[0]), null);
        });
        res.json({ ok: true });
    } catch (e) {
        console.error('[api] error borrando:', e.message);
        res.status(500).json({ error: 'No se pudo borrar: ' + e.message });
    }
});

// ---------- Sociedades ----------

router.post('/sociedades', async (req, res) => {
    const perfil = perfilDe(req);
    const { id, nombre, color } = req.body || {};
    if (!id || !nombre) return res.status(400).json({ error: 'Falta el nombre' });
    try {
        const creada = await enTransaccion(async (cliente) => {
            const { rows } = await cliente.query(
                `INSERT INTO sociedades (id, nombre, color, orden)
                 VALUES ($1, $2, $3, (SELECT COALESCE(MAX(orden),0)+1 FROM sociedades))
                 ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, color = EXCLUDED.color
                 RETURNING *`,
                [id, nombre, color || '#6366f1']
            );
            await registrar(cliente, perfil, 'guardar', 'sociedad', id, null, rows[0]);
            return rows[0];
        });
        res.json({ id: creada.id, nombre: creada.nombre, color: creada.color });
    } catch (e) {
        res.status(500).json({ error: 'No se pudo crear la sociedad: ' + e.message });
    }
});

// ---------- Perfiles ----------

router.post('/perfiles', async (req, res) => {
    const { nombre, rol } = req.body || {};
    if (!nombre) return res.status(400).json({ error: 'Falta el nombre' });
    const id = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'perfil';
    try {
        const { rows } = await consultar(
            `INSERT INTO perfiles (id, nombre, rol) VALUES ($1, $2, $3)
             ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, activo = TRUE
             RETURNING *`,
            [id, nombre, rol === 'lectura' ? 'lectura' : 'carga']
        ).then(r => ({ rows: r }));
        res.json({ id: rows[0].id, nombre: rows[0].nombre, rol: rows[0].rol });
    } catch (e) {
        res.status(500).json({ error: 'No se pudo crear el perfil: ' + e.message });
    }
});

router.delete('/perfiles/:id', async (req, res) => {
    try {
        await consultar('UPDATE perfiles SET activo = FALSE WHERE id = $1', [req.params.id]);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ---------- Migración desde el navegador ----------
// Nunca decide sola: primero simula y devuelve un informe en castellano.

router.post('/importar-local', async (req, res) => {
    const perfil = perfilDe(req);
    const modo = req.query.modo === 'aplicar' ? 'aplicar' : 'simular';
    const datos = req.body || {};
    const entrantes = Array.isArray(datos.inscripciones) ? datos.inscripciones : [];

    if (!entrantes.length) return res.status(400).json({ error: 'El navegador no tiene inscripciones para subir' });

    try {
        const actuales = await consultar('SELECT * FROM inscripciones');
        const porClave = {};
        actuales.forEach(f => { porClave[f.municipio_id + '|' + f.sociedad_id] = aInscripcion(f); });

        const nuevas = [];
        const iguales = [];
        const distintas = [];
        const sinMunicipio = [];

        const CAMPOS = ['estado', 'descripcion', 'notas', 'fechaAlta', 'fechaVto', 'sinVto', 'monto'];

        entrantes.forEach(i => {
            if (!i.municipioId) { sinMunicipio.push(i); return; }
            const clave = i.municipioId + '|' + i.clienteId;
            const actual = porClave[clave];
            if (!actual) { nuevas.push(i); return; }
            const difs = CAMPOS.filter(c => {
                const a = actual[c] === undefined || actual[c] === null ? '' : actual[c];
                const b = i[c] === undefined || i[c] === null ? '' : i[c];
                return String(a) !== String(b);
            });
            if (!difs.length) iguales.push(i);
            else distintas.push({ entrante: i, actual, campos: difs });
        });

        const informe = {
            modo,
            nuevas: nuevas.length,
            iguales: iguales.length,
            distintas: distintas.length,
            sinMunicipio: sinMunicipio.length,
            detalleDistintas: distintas.slice(0, 50),
            detalleSinMunicipio: sinMunicipio.slice(0, 50).map(i => i.partido)
        };

        // El JSON crudo se guarda SIEMPRE, también al simular: si algo sale mal
        // después, el original sigue estando acá.
        await consultar(
            `INSERT INTO importaciones_crudas (perfil_nombre, origen, json_crudo, resultado)
             VALUES ($1, $2, $3, $4)`,
            [perfil.nombre, 'localStorage', JSON.stringify(datos), JSON.stringify(informe)]
        );

        if (modo === 'simular') return res.json(informe);

        // Aplicar: solo las nuevas. Las distintas NO se tocan: las resuelve
        // una persona desde la pantalla de conflictos.
        const forzar = req.query.forzar === 'si';
        const aEscribir = forzar ? nuevas.concat(distintas.map(d => d.entrante)) : nuevas;

        await enTransaccion(async (cliente) => {
            for (const s of (datos.clientes || [])) {
                await cliente.query(
                    `INSERT INTO sociedades (id, nombre, color) VALUES ($1,$2,$3)
                     ON CONFLICT (id) DO NOTHING`,
                    [s.id, s.nombre, s.color || '#6366f1']
                );
            }
            for (const i of aEscribir) {
                await cliente.query(
                    `INSERT INTO inscripciones
                       (id, municipio_id, sociedad_id, estado, descripcion, notas,
                        fecha_alta, fecha_vto, sin_vto, monto, creado_por)
                     VALUES ($1,$2,$3,$4,$5,$6, NULLIF($7,'')::date, NULLIF($8,'')::date, $9,$10,$11)
                     ON CONFLICT (municipio_id, sociedad_id) DO UPDATE SET
                        estado = EXCLUDED.estado, descripcion = EXCLUDED.descripcion,
                        notas = EXCLUDED.notas, fecha_alta = EXCLUDED.fecha_alta,
                        fecha_vto = EXCLUDED.fecha_vto, sin_vto = EXCLUDED.sin_vto,
                        monto = EXCLUDED.monto, actualizado_por = $11, actualizado_en = now()`,
                    [i.id || 'ins_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                     i.municipioId, i.clienteId, i.estado || 'no-inscripto',
                     i.descripcion || '', i.notas || '', i.fechaAlta || '', i.fechaVto || '',
                     !!i.sinVto, i.monto === undefined || i.monto === '' ? null : i.monto,
                     perfil.nombre]
                );
            }
            await registrar(cliente, perfil, 'importar', 'inscripcion', null, null,
                { subidas: aEscribir.length, informe });
        });

        res.json({ ...informe, aplicadas: aEscribir.length });
    } catch (e) {
        console.error('[api] error importando:', e.message);
        res.status(500).json({ error: 'No se pudo importar: ' + e.message });
    }
});

// ---------- Salud y respaldo ----------

router.get('/salud', async (req, res) => {
    try {
        const [insc] = await consultar('SELECT COUNT(*)::int AS n FROM inscripciones');
        const [soc] = await consultar('SELECT COUNT(*)::int AS n FROM sociedades');
        const [aud] = await consultar('SELECT MAX(fecha) AS ultima FROM auditoria');
        res.json({
            base: 'conectada',
            inscripciones: insc.n,
            sociedades: soc.n,
            ultimoCambio: aud.ultima
        });
    } catch (e) {
        res.status(500).json({ base: 'sin conexión', error: e.message });
    }
});

router.get('/respaldo.json', async (req, res) => {
    try {
        const [sociedades, inscripciones] = await Promise.all([
            consultar('SELECT * FROM sociedades'),
            consultar('SELECT * FROM inscripciones')
        ]);
        res.setHeader('Content-Disposition',
            `attachment; filename="respaldo-${new Date().toISOString().slice(0, 10)}.json"`);
        res.json({
            version: '3.0',
            exportado: new Date().toISOString(),
            clientes: sociedades.map(s => ({ id: s.id, nombre: s.nombre, color: s.color })),
            inscripciones: inscripciones.map(aInscripcion)
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
