// Servidor estatico minimo para Railway
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Cache para assets estaticos (excepto HTML para que no quede pegado)
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/') {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
        res.set('Cache-Control', 'public, max-age=3600');
    }
    next();
});

app.use(express.static(__dirname, { index: 'index.html' }));

// SPA fallback (cualquier ruta no encontrada devuelve index.html)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Mapa Comercial corriendo en puerto ${PORT}`);
});
