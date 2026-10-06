// Endpoints de los avisos: probar la conexión, disparar a mano y
// configurar quién los recibe.
const express = require('express');
const { consultar } = require('../db/pool');
const { probarConexion, comoEstaConfigurado } = require('../lib/mailer');
const { correrAlertas, correrResumenSemanal } = require('../jobs/alertas');

const router = express.Router();

// Estado de la configuración de mail (no expone ningún secreto)
router.get('/alertas/estado', async (req, res) => {
    try {
        const via = comoEstaConfigurado();
        const quienes = await consultar(
            `SELECT id, nombre, email, recibe_alertas FROM perfiles WHERE activo ORDER BY nombre`
        );
        const prueba = via ? await probarConexion().catch(e => ({ ok: false, error: e.message })) : { ok: false, error: 'Sin configurar' };
        const ultimas = await consultar(
            `SELECT tipo, enviado_en, destinatarios FROM alertas_enviadas ORDER BY enviado_en DESC LIMIT 5`
        );
        res.json({
            configurado: !!via,
            via,
            conexion: prueba,
            perfiles: quienes,
            ultimosAvisos: ultimas
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Quién recibe los avisos y a qué dirección
router.post('/alertas/destinatario', async (req, res) => {
    const { perfilId, email, recibe } = req.body || {};
    if (!perfilId) return res.status(400).json({ error: 'Falta el perfil' });
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return res.status(400).json({ error: 'Ese correo no parece válido' });
    }
    try {
        await consultar(
            `UPDATE perfiles SET email = NULLIF($2,''), recibe_alertas = $3 WHERE id = $1`,
            [perfilId, email || '', !!recibe]
        );
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Disparar el envío. Lo usa el cron (con clave) y el botón "mandar ahora".
router.post('/jobs/alertas', async (req, res) => {
    const clave = process.env.CLAVE_JOBS;
    if (clave && req.get('X-Clave-Job') !== clave && req.query.clave !== clave) {
        return res.status(403).json({ error: 'Clave incorrecta' });
    }
    try {
        const r = req.query.tipo === 'semanal'
            ? await correrResumenSemanal()
            : await correrAlertas({ forzar: req.query.forzar === 'si' });
        res.json(r);
    } catch (e) {
        console.error('[alertas] falló el envío:', e.message);
        res.status(500).json({ ok: false, error: e.message });
    }
});

module.exports = router;
