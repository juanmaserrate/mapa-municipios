// Servidor del Mapa Comercial.
// Sirve el sitio y expone la API que guarda los datos en Postgres,
// para que el área comercial y administración vean lo mismo.
const express = require('express');
const path = require('path');

const { aplicarMigraciones } = require('./db/migrar');
const { hayBase } = require('./db/pool');
const apiDatos = require('./api/datos');
const apiLicitaciones = require('./api/licitaciones');
const apiAlertas = require('./api/alertas');
const apiResumen = require('./api/resumen');
const { indexVersionado } = require('./lib/versionado');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '25mb' })); // la migración sube todo el navegador de una

// Cache para assets estaticos (excepto HTML para que no quede pegado)
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        res.set('Cache-Control', 'no-store');
    } else if (req.path.endsWith('.html') || req.path === '/') {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
        res.set('Cache-Control', 'public, max-age=3600');
    }
    next();
});

app.use('/api', apiDatos);
app.use('/api', apiLicitaciones);
app.use('/api', apiAlertas);
app.use('/api', apiResumen);

// El index se sirve con los numeros de version calculados del contenido
// de cada archivo, asi nadie tiene que acordarse de subirlos a mano.
function servirIndex(req, res) {
    res.type('html').send(indexVersionado());
}

app.get('/', servirIndex);
app.use(express.static(__dirname, { index: false }));

// Cualquier ruta que no sea de la API devuelve el sitio
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'No existe ese endpoint' });
    servirIndex(req, res);
});

async function arrancar() {
    try {
        await aplicarMigraciones();
    } catch (e) {
        // Si la base falla, el sitio tiene que levantar igual: el navegador
        // muestra los últimos datos conocidos y avisa que no se puede editar.
        console.error('[arranque] no se pudo preparar la base:', e.message);
    }

    app.listen(PORT, () => {
        console.log(`Mapa Comercial en el puerto ${PORT} · base: ${hayBase ? 'configurada' : 'NO configurada'}`);
    });
}

arrancar();
