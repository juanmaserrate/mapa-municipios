// API de licitaciones: el registro propio de cada proceso, con su
// expediente, sus fechas, su resultado y sus competidores.
const express = require('express');
const { consultar, enTransaccion } = require('../db/pool');

const router = express.Router();

const ESTADOS = ['oportunidad', 'en-preparacion', 'presentada', 'en-evaluacion',
                 'ganada', 'perdida', 'desierta', 'desistida', 'a-clasificar'];

function perfilDe(req) {
    return {
        id: (req.get('X-Perfil-Id') || '').slice(0, 60) || null,
        nombre: (req.get('X-Perfil-Nombre') || '').slice(0, 120) || null
    };
}

function fecha(d) {
    return d ? d.toISOString().slice(0, 10) : '';
}

function numero(n) {
    return n === null || n === undefined ? null : Number(n);
}

function aLicitacion(f) {
    return {
        id: f.id,
        municipioId: f.municipio_id,
        sociedades: f.sociedades || [],
        expediente: f.expediente || '',
        objeto: f.objeto || '',
        tipo: f.tipo || '',
        estadoProceso: f.estado_proceso,
        fechaPublicacion: fecha(f.fecha_publicacion),
        fechaApertura: fecha(f.fecha_apertura),
        fechaResultado: fecha(f.fecha_resultado),
        montoPresupuesto: numero(f.monto_presupuesto),
        montoOfertado: numero(f.monto_ofertado),
        montoAdjudicado: numero(f.monto_adjudicado),
        plazoMeses: f.plazo_meses === null ? null : Number(f.plazo_meses),
        notas: f.notas || '',
        origen: f.origen,
        competidores: f.competidores || [],
        creadoPor: f.creado_por,
        creado: f.creado_en,
        actualizadoPor: f.actualizado_por,
        actualizado: f.actualizado_en
    };
}

const SQL_LISTA = `
    SELECT l.*,
           COALESCE(
               (SELECT array_agg(ls.sociedad_id) FROM licitacion_sociedades ls WHERE ls.licitacion_id = l.id),
               ARRAY[]::text[]
           ) AS sociedades,
           COALESCE(
               (SELECT json_agg(json_build_object(
                   'id', c.id, 'nombre', c.nombre,
                   'montoOfertado', c.monto_ofertado, 'resultado', c.resultado, 'notas', c.notas
               ) ORDER BY c.monto_ofertado NULLS LAST) FROM licitacion_competidores c WHERE c.licitacion_id = l.id),
               '[]'::json
           ) AS competidores
      FROM licitaciones l
`;

router.get('/licitaciones', async (req, res) => {
    try {
        const filas = await consultar(SQL_LISTA + ' ORDER BY COALESCE(l.fecha_apertura, l.creado_en::date) DESC');
        res.json(filas.map(aLicitacion));
    } catch (e) {
        console.error('[api] error leyendo licitaciones:', e.message);
        res.status(500).json({ error: 'No se pudieron leer las licitaciones: ' + e.message });
    }
});

router.post('/licitaciones', async (req, res) => {
    const perfil = perfilDe(req);
    const b = req.body || {};

    // Solo dos cosas obligatorias: así el área comercial puede cargar
    // una oportunidad en 10 segundos y completarla después.
    if (!b.municipioId) return res.status(400).json({ error: 'Falta el municipio' });
    if (!b.objeto || !String(b.objeto).trim()) return res.status(400).json({ error: 'Falta el objeto de la licitación' });

    const estado = ESTADOS.includes(b.estadoProceso) ? b.estadoProceso : 'oportunidad';
    const id = b.id || 'lic_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

    try {
        await enTransaccion(async (cli) => {
            await cli.query(
                `INSERT INTO licitaciones
                   (id, municipio_id, expediente, objeto, tipo, estado_proceso,
                    fecha_publicacion, fecha_apertura, fecha_resultado,
                    monto_presupuesto, monto_ofertado, monto_adjudicado,
                    plazo_meses, notas, creado_por)
                 VALUES ($1,$2,$3,$4,$5,$6,
                         NULLIF($7,'')::date, NULLIF($8,'')::date, NULLIF($9,'')::date,
                         $10,$11,$12,$13,$14,$15)
                 ON CONFLICT (id) DO UPDATE SET
                    municipio_id = EXCLUDED.municipio_id,
                    expediente = EXCLUDED.expediente,
                    objeto = EXCLUDED.objeto,
                    tipo = EXCLUDED.tipo,
                    estado_proceso = EXCLUDED.estado_proceso,
                    fecha_publicacion = EXCLUDED.fecha_publicacion,
                    fecha_apertura = EXCLUDED.fecha_apertura,
                    fecha_resultado = EXCLUDED.fecha_resultado,
                    monto_presupuesto = EXCLUDED.monto_presupuesto,
                    monto_ofertado = EXCLUDED.monto_ofertado,
                    monto_adjudicado = EXCLUDED.monto_adjudicado,
                    plazo_meses = EXCLUDED.plazo_meses,
                    notas = EXCLUDED.notas,
                    actualizado_por = $15,
                    actualizado_en = now()`,
                [id, b.municipioId, b.expediente || '', String(b.objeto).trim(), b.tipo || '', estado,
                 b.fechaPublicacion || '', b.fechaApertura || '', b.fechaResultado || '',
                 b.montoPresupuesto ?? null, b.montoOfertado ?? null, b.montoAdjudicado ?? null,
                 b.plazoMeses ?? null, b.notas || '', perfil.nombre]
            );

            // Sociedades: se reemplaza el conjunto completo (soporta UTE)
            await cli.query('DELETE FROM licitacion_sociedades WHERE licitacion_id = $1', [id]);
            for (const sid of (b.sociedades || [])) {
                await cli.query(
                    'INSERT INTO licitacion_sociedades (licitacion_id, sociedad_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
                    [id, sid]
                );
            }

            // Competidores: idem
            await cli.query('DELETE FROM licitacion_competidores WHERE licitacion_id = $1', [id]);
            for (const c of (b.competidores || [])) {
                if (!c.nombre || !String(c.nombre).trim()) continue;
                await cli.query(
                    `INSERT INTO licitacion_competidores (id, licitacion_id, nombre, monto_ofertado, resultado, notas)
                     VALUES ($1,$2,$3,$4,$5,$6)`,
                    [c.id || 'comp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                     id, String(c.nombre).trim(), c.montoOfertado ?? null,
                     ['gano', 'perdio', 'participo'].includes(c.resultado) ? c.resultado : 'participo',
                     c.notas || '']
                );
            }

            await cli.query(
                `INSERT INTO auditoria (perfil_id, perfil_nombre, accion, entidad, entidad_id, despues)
                 VALUES ($1,$2,'guardar','licitacion',$3,$4)`,
                [perfil.id, perfil.nombre, id, JSON.stringify(b)]
            );
        });

        const [fila] = await consultar(SQL_LISTA + ' WHERE l.id = $1', [id]);
        res.json(aLicitacion(fila));
    } catch (e) {
        console.error('[api] error guardando licitación:', e.message);
        res.status(500).json({ error: 'No se pudo guardar: ' + e.message });
    }
});

router.delete('/licitaciones/:id', async (req, res) => {
    const perfil = perfilDe(req);
    try {
        await enTransaccion(async (cli) => {
            const { rows } = await cli.query('SELECT * FROM licitaciones WHERE id = $1', [req.params.id]);
            if (!rows.length) return;
            await cli.query('DELETE FROM licitaciones WHERE id = $1', [req.params.id]);
            await cli.query(
                `INSERT INTO auditoria (perfil_id, perfil_nombre, accion, entidad, entidad_id, antes)
                 VALUES ($1,$2,'borrar','licitacion',$3,$4)`,
                [perfil.id, perfil.nombre, req.params.id, JSON.stringify(rows[0])]
            );
        });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: 'No se pudo eliminar: ' + e.message });
    }
});

module.exports = router;
