// ============================================================
// Historial de cambios
// ============================================================
// Quién cargó o cambió qué, y cuándo. Lo ve cualquier perfil: no hay
// nada escondido. También se puede bajar a Excel como la tabla.

const historial = {
    filas: [],
    cargando: false,
    filtroQuien: '',
    filtroAccion: '',

    async cargar() {
        if (!modoServidor) {
            this.filas = [];
            this.render();
            return;
        }
        this.cargando = true;
        this.render();
        try {
            this.filas = await api.historial(500);
        } catch (e) {
            this.filas = [];
            toast('No se pudo leer el historial: ' + e.message, 'error');
        } finally {
            this.cargando = false;
            this.render();
        }
    },

    filtradas() {
        return this.filas.filter(f => {
            if (this.filtroQuien && f.quien !== this.filtroQuien) return false;
            if (this.filtroAccion && f.accion !== this.filtroAccion) return false;
            return true;
        });
    },

    textoAccion(a) {
        return ({ guardar: 'Guardó', borrar: 'Eliminó', importar: 'Subió datos' })[a] || a;
    },

    // Qué cambió en concreto, en castellano
    resumenCambio(f) {
        if (f.accion === 'importar') {
            const n = f.despues && f.despues.subidas;
            return n ? `${n} inscripciones subidas desde un navegador` : 'Datos subidos desde un navegador';
        }
        if (f.accion === 'borrar') {
            return 'Se eliminó la inscripción';
        }
        if (!f.despues) return '';

        const partes = [];
        const d = f.despues;
        if (d.estado) partes.push(textoEstado(d.estado));
        if (d.fechaVto) partes.push('vence ' + fechaLegible(d.fechaVto));
        else if (d.sinVto) partes.push('sin vencimiento');
        if (d.monto !== null && d.monto !== undefined && d.monto !== '') partes.push(formatMonto(Number(d.monto)));
        if (d.notas) partes.push('«' + String(d.notas).slice(0, 60) + (String(d.notas).length > 60 ? '…' : '') + '»');
        return partes.join(' · ');
    },

    fechaHora(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
    },

    render() {
        const cont = document.getElementById('historialContenido');
        if (!cont) return;

        if (!modoServidor) {
            cont.innerHTML = '<div class="empty-state">El historial necesita el servidor. Estás trabajando solo en este navegador.</div>';
            document.getElementById('historialResumen').textContent = '—';
            return;
        }

        if (this.cargando) {
            cont.innerHTML = '<div class="empty-state">Cargando el historial...</div>';
            return;
        }

        this.renderFiltros();

        const filas = this.filtradas();
        document.getElementById('historialResumen').textContent =
            `${filas.length} ${filas.length === 1 ? 'cambio' : 'cambios'}`;

        if (!filas.length) {
            cont.innerHTML = '<div class="empty-state">Todavía no hay cambios registrados.</div>';
            return;
        }

        // Agrupadas por día, que es como se lee de verdad
        const porDia = {};
        filas.forEach(f => {
            const dia = String(f.fecha).slice(0, 10);
            (porDia[dia] = porDia[dia] || []).push(f);
        });

        cont.innerHTML = Object.keys(porDia).sort().reverse().map(dia => `
            <div class="hist-dia">
                <div class="hist-dia-titulo">${fechaLegible(dia)}</div>
                ${porDia[dia].map(f => `
                    <div class="hist-item ${f.accion}">
                        <span class="hist-inicial">${escapeHtml((f.quien || '?').trim().charAt(0).toUpperCase())}</span>
                        <div class="hist-cuerpo">
                            <div class="hist-linea">
                                <strong>${escapeHtml(f.quien)}</strong>
                                <span class="hist-accion">${escapeHtml(this.textoAccion(f.accion))}</span>
                                ${f.municipio ? `<span class="hist-donde">${escapeHtml(f.municipio)}${f.sociedad ? ' · ' + escapeHtml(f.sociedad) : ''}</span>` : ''}
                            </div>
                            ${this.resumenCambio(f) ? `<div class="hist-detalle">${escapeHtml(this.resumenCambio(f))}</div>` : ''}
                        </div>
                        <span class="hist-hora">${this.fechaHora(f.fecha).slice(-5)}</span>
                    </div>
                `).join('')}
            </div>
        `).join('');
    },

    renderFiltros() {
        const cont = document.getElementById('historialFiltros');
        if (!cont || cont.dataset.armado === String(this.filas.length)) return;
        cont.dataset.armado = String(this.filas.length);

        const quienes = [...new Set(this.filas.map(f => f.quien))].sort();
        cont.innerHTML = `
            <select id="histQuien">
                <option value="">Todos los perfiles</option>
                ${quienes.map(q => `<option value="${escapeHtml(q)}" ${this.filtroQuien === q ? 'selected' : ''}>${escapeHtml(q)}</option>`).join('')}
            </select>
            <select id="histAccion">
                <option value="">Todo tipo de cambio</option>
                <option value="guardar" ${this.filtroAccion === 'guardar' ? 'selected' : ''}>Solo guardados</option>
                <option value="borrar" ${this.filtroAccion === 'borrar' ? 'selected' : ''}>Solo eliminados</option>
                <option value="importar" ${this.filtroAccion === 'importar' ? 'selected' : ''}>Solo subidas de datos</option>
            </select>
        `;
        document.getElementById('histQuien').addEventListener('change', (e) => {
            this.filtroQuien = e.target.value;
            this.render();
        });
        document.getElementById('histAccion').addEventListener('change', (e) => {
            this.filtroAccion = e.target.value;
            this.render();
        });
    },

    exportarExcel() {
        const filas = this.filtradas();
        if (!filas.length) { toast('No hay movimientos para exportar', 'warning'); return; }

        const campo = (v) => {
            if (v === null || v === undefined) return '';
            const s = String(v);
            return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };

        const lineas = ['Fecha y hora;Quién;Qué hizo;Municipio;Sociedad;Detalle'];
        filas.forEach(f => {
            lineas.push([
                campo(this.fechaHora(f.fecha)),
                campo(f.quien),
                campo(this.textoAccion(f.accion)),
                campo(f.municipio || ''),
                campo(f.sociedad || ''),
                campo(this.resumenCambio(f))
            ].join(';'));
        });

        const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `historial-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast(`${filas.length} movimientos descargados`, 'success');
    }
};
