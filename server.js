// Servidor del Mapa Comercial.
// Sirve el sitio y expone la API que guarda los datos en Postgres,
// para que el área comercial y administración vean lo mismo.
const express = require('express');
const path = require('path');

const { aplicarMigraciones } = require('./db/migrar');
const { hayBase } = require('./db/pool');
const apiDatos = require('./api/datos');

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

app.use(express.static(__dirname, { index: 'index.html' }));

// Cualquier ruta que no sea de la API devuelve el sitio
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'No existe ese endpoint' });
    res.sendFile(path.join(__dirname, 'index.html'));
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
