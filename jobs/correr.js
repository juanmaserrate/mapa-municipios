// Punto de entrada del trabajo programado.
// Railway lo corre como servicio cron; también sirve para dispararlo a mano:
//   node jobs/correr.js            → avisos del día
//   TIPO_JOB=semanal node jobs/correr.js  → resumen semanal
const { aplicarMigraciones } = require('../db/migrar');
const { correrAlertas, correrResumenSemanal } = require('./alertas');

(async () => {
    try {
        await aplicarMigraciones();
        const resultado = process.env.TIPO_JOB === 'semanal'
            ? await correrResumenSemanal()
            : await correrAlertas();
        console.log('[job]', JSON.stringify(resultado));
        process.exit(0);
    } catch (e) {
        console.error('[job] falló:', e.message);
        process.exit(1);
    }
})();
