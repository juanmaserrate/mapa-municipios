// ============================================================
// Versionado automático de los archivos del sitio
// ============================================================
// Hasta ahora había que subir a mano el ?v=24 de cada <script> y <link>
// en index.html. Si alguien se olvidaba, la gente seguía viendo la
// versión vieja y el error era invisible.
//
// Ahora el número sale del contenido del archivo: si el archivo cambia,
// cambia el número; si no, no. Nadie tiene que acordarse de nada.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');

function huella(rutaRelativa) {
    try {
        const contenido = fs.readFileSync(path.join(RAIZ, rutaRelativa));
        return crypto.createHash('sha1').update(contenido).digest('hex').slice(0, 8);
    } catch (e) {
        // Si el archivo no está, se deja lo que haya: mejor eso que romper la página
        return null;
    }
}

// Reemplaza ?v=lo-que-sea por la huella real del archivo
function versionarHtml(html) {
    return html.replace(
        /(src|href)="((?:js|css)\/[^"?]+)(\?v=[^"]*)?"/g,
        (completo, atributo, archivo) => {
            const h = huella(archivo);
            return h ? `${atributo}="${archivo}?v=${h}"` : completo;
        }
    );
}

// El index.html se arma una vez al arrancar: los archivos no cambian
// mientras el servidor corre.
let htmlCache = null;

function indexVersionado() {
    if (htmlCache) return htmlCache;
    const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    htmlCache = versionarHtml(html);
    return htmlCache;
}

function limpiarCache() {
    htmlCache = null;
}

module.exports = { indexVersionado, versionarHtml, huella, limpiarCache };
