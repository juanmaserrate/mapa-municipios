// ============================================================
// Capa de comunicación con el servidor
// ============================================================
// Todo lo que entra y sale de la base pasa por acá. El resto de la app
// no sabe si hay servidor o no: pregunta por `api.conectado`.

const api = {
    conectado: false,
    ultimoError: null,

    // Perfil de quien está usando el sitio: identifica, no restringe.
    perfil: null,

    cabeceras() {
        const h = { 'Content-Type': 'application/json' };
        if (this.perfil) {
            h['X-Perfil-Id'] = this.perfil.id;
            h['X-Perfil-Nombre'] = this.perfil.nombre;
        }
        return h;
    },

    async pedir(ruta, opciones = {}) {
        const res = await fetch('/api' + ruta, {
            ...opciones,
            headers: { ...this.cabeceras(), ...(opciones.headers || {}) }
        });
        const texto = await res.text();
        let datos;
        try {
            datos = texto ? JSON.parse(texto) : {};
        } catch (e) {
            throw new Error('El servidor respondió algo que no se entiende');
        }
        if (!res.ok) throw new Error(datos.error || 'Error ' + res.status);
        return datos;
    },

    // Lee todo de una. Si el servidor no responde, devuelve null y la app
    // sigue andando con la última copia guardada en el navegador.
    async leerEstado() {
        try {
            const datos = await this.pedir('/estado');
            this.conectado = true;
            this.ultimoError = null;
            return datos;
        } catch (e) {
            this.conectado = false;
            this.ultimoError = e.message;
            console.warn('[api] sin servidor:', e.message);
            return null;
        }
    },

    guardarInscripcion(insc) {
        return this.pedir('/inscripciones', { method: 'POST', body: JSON.stringify(insc) });
    },

    borrarInscripcion(id) {
        return this.pedir('/inscripciones/' + encodeURIComponent(id), { method: 'DELETE' });
    },

    crearSociedad(soc) {
        return this.pedir('/sociedades', { method: 'POST', body: JSON.stringify(soc) });
    },

    crearPerfil(nombre, rol) {
        return this.pedir('/perfiles', { method: 'POST', body: JSON.stringify({ nombre, rol }) });
    },

    // Migración: primero simula y devuelve el informe, después aplica.
    migrarDesdeNavegador(datos, modo, forzar) {
        const q = '?modo=' + modo + (forzar ? '&forzar=si' : '');
        return this.pedir('/importar-local' + q, { method: 'POST', body: JSON.stringify(datos) });
    },

    leerLicitaciones() {
        return this.pedir('/licitaciones');
    },

    guardarLicitacion(lic) {
        return this.pedir('/licitaciones', { method: 'POST', body: JSON.stringify(lic) });
    },

    borrarLicitacion(id) {
        return this.pedir('/licitaciones/' + encodeURIComponent(id), { method: 'DELETE' });
    },

    // Historial: lo puede ver cualquier perfil
    historial(limite) {
        return this.pedir('/historial?limite=' + (limite || 300));
    },

    estadoAvisos() {
        return this.pedir('/alertas/estado');
    },

    guardarDestinatario(perfilId, email, recibe) {
        return this.pedir('/alertas/destinatario', {
            method: 'POST',
            body: JSON.stringify({ perfilId, email, recibe })
        });
    },

    mandarAvisoAhora() {
        return this.pedir('/jobs/alertas?forzar=si', { method: 'POST' });
    },

    salud() {
        return this.pedir('/salud');
    }
};
