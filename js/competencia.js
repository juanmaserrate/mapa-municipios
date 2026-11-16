// ============================================================
// Vista de Competencia
// ============================================================
// Contra quién se pelea cada licitación, a qué precio, y cómo nos fue.
// Los datos salen de las actas de apertura cargadas en cada licitación.

const competencia = {
    datos: null,
    cargando: false,
    orden: { campo: 'veces', dir: 'desc' },

    async cargar() {
        if (!modoServidor) { this.render(); return; }
        this.cargando = true;
        this.render();
        try {
            this.datos = await api.competencia();
        } catch (e) {
            this.datos = null;
            toast('No se pudo cargar la competencia: ' + e.message, 'error');
        } finally {
            this.cargando = false;
            this.render();
        }
    },

    ordenar(filas) {
        const { campo, dir } = this.orden;
        const signo = dir === 'asc' ? 1 : -1;
        return filas.slice().sort((a, b) => {
            let va = a[campo], vb = b[campo];
            const aVacio = va === null || va === undefined || va === '';
            const bVacio = vb === null || vb === undefined || vb === '';
            if (aVacio && bVacio) return 0;
            if (aVacio) return 1;
            if (bVacio) return -1;
            if (typeof va === 'number') return (va - vb) * signo;
            return String(va).localeCompare(String(vb), 'es') * signo;
        });
    },

    render() {
        const cont = document.getElementById('competenciaContenido');
        if (!cont) return;

        if (!modoServidor) {
            cont.innerHTML = '<div class="empty-state">La competencia necesita el servidor.</div>';
            return;
        }
        if (this.cargando) {
            cont.innerHTML = '<div class="empty-state">Cargando...</div>';
            return;
        }
        if (!this.datos) {
            cont.innerHTML = '<div class="empty-state">No se pudo cargar.</div>';
            return;
        }

        const d = this.datos;
        if (!d.competidores.length) {
            cont.innerHTML = `
                <div class="empty-state">
                    Todavía no hay competidores cargados.<br><br>
                    Se cargan dentro de cada licitación, en el bloque <strong>Competidores</strong>:
                    quién se presentó y cuánto ofertó. Esos datos están en las actas de apertura.
                </div>`;
            document.getElementById('competenciaResumen').textContent = '—';
            return;
        }

        document.getElementById('competenciaResumen').textContent =
            `${d.resumen.distintos} ${d.resumen.distintos === 1 ? 'competidor' : 'competidores'} distintos`;

        const faltan = d.resumen.licitacionesTotales - d.resumen.licitacionesConDatos;

        cont.innerHTML = [
            faltan > 0 ? `
                <div class="tb-nota" style="margin-bottom:18px">
                    Los números salen de <strong>${d.resumen.licitacionesConDatos}</strong>
                    ${d.resumen.licitacionesConDatos === 1 ? 'licitación' : 'licitaciones'} con el acta cargada.
                    Faltan <strong>${faltan}</strong> sin competidores: mientras no se carguen, el panorama queda incompleto.
                </div>` : '',
            this.bloqueCompetidores(d),
            this.bloqueCaraACara(d),
            this.bloqueMunicipios(d)
        ].join('');

        cont.querySelectorAll('th[data-col]').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.col;
                if (this.orden.campo === col) this.orden.dir = this.orden.dir === 'asc' ? 'desc' : 'asc';
                else this.orden = { campo: col, dir: col === 'nombre' ? 'asc' : 'desc' };
                this.render();
            });
        });
    },

    // ---------- Quiénes son ----------
    bloqueCompetidores(d) {
        const filas = this.ordenar(d.competidores);
        const flecha = (c) => this.orden.campo === c ? (this.orden.dir === 'asc' ? ' ▲' : ' ▼') : '';

        return `
            <section class="tb-seccion">
                <h3 class="tb-titulo">Quiénes se presentan</h3>
                <div class="tabla-scroll">
                <table class="tabla-datos comp-tabla">
                    <thead><tr>
                        <th data-col="nombre">Empresa${flecha('nombre')}</th>
                        <th data-col="veces">Se presentó${flecha('veces')}</th>
                        <th data-col="gano">Ganó${flecha('gano')}</th>
                        <th data-col="municipios">Municipios${flecha('municipios')}</th>
                        <th data-col="promedio">Oferta promedio${flecha('promedio')}</th>
                        <th data-col="desvio">Contra nosotros${flecha('desvio')}</th>
                        <th data-col="ultimaVez">Última vez${flecha('ultimaVez')}</th>
                    </tr></thead>
                    <tbody>
                        ${filas.map(c => `
                            <tr>
                                <td class="col-municipio" title="${escapeHtml(c.donde)}">${escapeHtml(c.nombre)}</td>
                                <td class="col-dias">${c.veces}</td>
                                <td class="col-dias">${c.gano ? `<span class="tb-tasa floja">${c.gano}</span>` : '—'}</td>
                                <td class="col-dias">${c.municipios}</td>
                                <td class="col-monto">${c.promedio ? formatMonto(c.promedio) : '—'}</td>
                                <td class="col-dias">${this.celdaDesvio(c.desvio)}</td>
                                <td class="col-fecha">${c.ultimaVez ? fechaLegible(c.ultimaVez) : '—'}</td>
                            </tr>`).join('')}
                    </tbody>
                </table>
                </div>
                <div class="comp-ayuda">
                    <strong>Contra nosotros</strong>: cuánto más caro o más barato ofertó esa empresa
                    comparado con lo que ofertamos en la misma licitación.
                    En verde los que ofertan por encima nuestro, en rojo los que entran por debajo.
                    Pasá el mouse sobre el nombre para ver en qué municipios aparece.
                </div>
            </section>`;
    },

    celdaDesvio(d) {
        if (d === null || d === undefined) return '—';
        const signo = d > 0 ? '+' : '';
        // Si oferta por encima nuestro nos conviene (verde); por debajo, nos aprieta (rojo)
        const clase = d > 0 ? 'buena' : 'floja';
        return `<span class="tb-tasa ${clase}">${signo}${d}%</span>`;
    },

    // ---------- Cómo nos fue contra cada uno ----------
    bloqueCaraACara(d) {
        const filas = d.caraACara.filter(c => c.ganamos || c.perdimos);
        if (!filas.length) return '';

        return `
            <section class="tb-seccion">
                <h3 class="tb-titulo">Cómo nos fue contra cada uno</h3>
                <div class="comp-duelos">
                    ${filas.map(c => {
                        const resueltas = c.ganamos + c.perdimos;
                        const pct = resueltas ? Math.round((c.ganamos / resueltas) * 100) : 0;
                        return `
                            <div class="comp-duelo">
                                <div class="comp-duelo-top">
                                    <strong>${escapeHtml(c.nombre)}</strong>
                                    <span class="comp-marcador">
                                        <span class="comp-gane">${c.ganamos}</span> —
                                        <span class="comp-perdi">${c.perdimos}</span>
                                    </span>
                                </div>
                                <div class="comp-barra">
                                    <div class="comp-barra-gane" style="width:${pct}%"></div>
                                </div>
                                <div class="comp-duelo-pie">
                                    ganamos ${c.ganamos} de ${resueltas}
                                    ${c.sinResolver ? ` · ${c.sinResolver} sin resolver` : ''}
                                </div>
                            </div>`;
                    }).join('')}
                </div>
            </section>`;
    },

    // ---------- Dónde se pelea más ----------
    bloqueMunicipios(d) {
        if (!d.porMunicipio.length) return '';
        return `
            <section class="tb-seccion">
                <h3 class="tb-titulo">Dónde hay más competencia</h3>
                <div class="tabla-scroll">
                <table class="tabla-datos comp-tabla">
                    <thead><tr>
                        <th>Municipio</th><th>Licitaciones</th><th>Empresas distintas</th><th>Promedio por licitación</th>
                    </tr></thead>
                    <tbody>
                        ${d.porMunicipio.map(m => `
                            <tr>
                                <td class="col-municipio">${escapeHtml(m.municipio)}</td>
                                <td class="col-dias">${m.licitaciones}</td>
                                <td class="col-dias">${m.competidores}</td>
                                <td class="col-dias">${m.promedioPorLicitacion ?? '—'}</td>
                            </tr>`).join('')}
                    </tbody>
                </table>
                </div>
            </section>`;
    },

    // ---------- Excel ----------
    exportarExcel() {
        if (!this.datos || !this.datos.competidores.length) {
            toast('Todavía no hay competidores cargados', 'warning');
            return;
        }
        const d = this.datos;
        const campo = (v) => {
            if (v === null || v === undefined) return '';
            const s = String(v);
            return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        const num = (n) => (n === null || n === undefined) ? '' : String(n).replace('.', ',');

        const L = [];
        L.push('COMPETIDORES;Se presento;Gano;Municipios;Oferta promedio;Minima;Maxima;% contra nosotros;Ultima vez;Donde');
        this.ordenar(d.competidores).forEach(c => {
            L.push([campo(c.nombre), c.veces, c.gano, c.municipios, num(c.promedio),
                    num(c.minimo), num(c.maximo), num(c.desvio),
                    campo(c.ultimaVez ? fechaLegible(c.ultimaVez) : ''), campo(c.donde)].join(';'));
        });
        L.push('');

        if (d.caraACara.length) {
            L.push('CARA A CARA;Ganamos;Perdimos;Sin resolver');
            d.caraACara.forEach(c => L.push([campo(c.nombre), c.ganamos, c.perdimos, c.sinResolver].join(';')));
            L.push('');
        }

        L.push('POR MUNICIPIO;Licitaciones;Empresas distintas;Promedio por licitacion');
        d.porMunicipio.forEach(m => L.push([campo(m.municipio), m.licitaciones, m.competidores, num(m.promedioPorLicitacion)].join(';')));

        const blob = new Blob(['﻿' + L.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `competencia-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast('Competencia descargada', 'success');
    }
};
