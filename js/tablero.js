// ============================================================
// Tablero
// ============================================================
// Lo que no se puede leer en un mapa de colores: plata, comparaciones y
// huecos. Lo ve cualquier perfil, no es una vista exclusiva de nadie.

const tablero = {
    datos: null,
    cargando: false,

    async cargar() {
        if (!modoServidor) { this.render(); return; }
        this.cargando = true;
        this.render();
        try {
            this.datos = await api.resumen();
        } catch (e) {
            this.datos = null;
            toast('No se pudo armar el tablero: ' + e.message, 'error');
        } finally {
            this.cargando = false;
            this.render();
        }
    },

    render() {
        const cont = document.getElementById('tableroContenido');
        if (!cont) return;

        if (!modoServidor) {
            cont.innerHTML = '<div class="empty-state">El tablero necesita el servidor.</div>';
            return;
        }
        if (this.cargando) {
            cont.innerHTML = '<div class="empty-state">Haciendo las cuentas...</div>';
            return;
        }
        if (!this.datos) {
            cont.innerHTML = '<div class="empty-state">No se pudo cargar el tablero.</div>';
            return;
        }

        const d = this.datos;

        if (!d.plata.totalLicitaciones) {
            cont.innerHTML = `
                <div class="empty-state">
                    Todavía no hay licitaciones cargadas.<br>
                    Entrá a un municipio desde el mapa y agregá la primera: el tablero se arma solo.
                </div>`;
            return;
        }

        cont.innerHTML = [
            this.bloquePlata(d),
            this.bloqueRubros(d),
            this.bloqueSociedades(d),
            this.bloqueProceso(d),
            this.bloqueOportunidades(d),
            this.bloqueCompetencia(d)
        ].join('');
    },

    // ---------- Plata ----------
    bloquePlata(d) {
        const p = d.plata;
        const desvio = p.desvioPresupuesto;
        return `
            <section class="tb-seccion">
                <h3 class="tb-titulo">La plata</h3>
                <div class="tb-tarjetas">
                    ${this.tarjeta('Ofertado esperando resultado', formatMonto(p.ofertadoVivo), 'Lo que todavía puede entrar', 'curso')}
                    ${this.tarjeta('Adjudicado ganado', formatMonto(p.ganado), 'Contratos que ya son nuestros', 'ganado')}
                    ${this.tarjeta('Comprometido por mes', formatMonto(p.comprometidoPorMes),
                        p.ganadasSinPlazo ? `${p.ganadasSinPlazo} ganada${p.ganadasSinPlazo > 1 ? 's' : ''} sin plazo cargado` : 'Adjudicado dividido el plazo', 'mes')}
                    ${this.tarjeta('Perdido', formatMonto(p.perdido), 'Lo que ofertamos y se llevó otro', 'perdido')}
                </div>
                ${desvio !== null ? `
                    <div class="tb-nota">
                        Ofertamos en promedio un <strong>${Math.abs(desvio)}% ${desvio < 0 ? 'por debajo' : 'por encima'}</strong>
                        del presupuesto oficial${desvio < 0 ? '' : ' — conviene mirarlo'}.
                    </div>` : ''}
                ${d.vencenConPlata.cantidad ? `
                    <div class="tb-alerta">
                        <strong>${d.vencenConPlata.cantidad} alta${d.vencenConPlata.cantidad > 1 ? 's' : ''}</strong>
                        vence${d.vencenConPlata.cantidad > 1 ? 'n' : ''} este mes
                        ${d.vencenConPlata.plataDetras ? `y cubre${d.vencenConPlata.cantidad > 1 ? 'n' : ''} <strong>${formatMonto(d.vencenConPlata.plataDetras)}</strong> ya adjudicados` : ''}.
                    </div>` : ''}
            </section>`;
    },

    tarjeta(titulo, valor, pie, clase) {
        return `
            <div class="tb-tarjeta ${clase}">
                <span class="tb-tarjeta-titulo">${escapeHtml(titulo)}</span>
                <strong class="tb-tarjeta-valor">${valor || '$ 0'}</strong>
                <span class="tb-tarjeta-pie">${escapeHtml(pie)}</span>
            </div>`;
    },

    // ---------- Que se licita de cada rubro ----------
    bloqueRubros(d) {
        const filas = (d.porRubro || []).filter(r => r.cantidad);
        if (!filas.length) return '';
        return `
            <section class="tb-seccion">
                <h3 class="tb-titulo">Qué se licita de cada rubro</h3>
                <div class="tabla-scroll">
                <table class="tabla-datos tb-tabla">
                    <thead><tr>
                        <th>Rubro</th><th>Licitaciones</th><th>En curso</th><th>Ganadas</th>
                        <th>Ofertado</th><th>Ganado</th>
                    </tr></thead>
                    <tbody>
                        ${filas.map(r => `
                            <tr>
                                <td class="col-municipio">${escapeHtml(r.rubro)}</td>
                                <td class="col-dias">${r.cantidad}</td>
                                <td class="col-dias">${r.vivas}</td>
                                <td class="col-dias">${r.ganadas}</td>
                                <td class="col-monto">${r.ofertado ? formatMonto(r.ofertado) : '—'}</td>
                                <td class="col-monto">${r.ganado ? formatMonto(r.ganado) : '—'}</td>
                            </tr>`).join('')}
                    </tbody>
                </table>
                </div>
            </section>`;
    },

    // ---------- Por sociedad ----------
    bloqueSociedades(d) {
        const filas = d.porSociedad.filter(s => s.vivas || s.ganadas || s.perdidas);
        if (!filas.length) return '';
        const cob = {};
        d.cobertura.forEach(c => { cob[c.nombre] = c; });

        return `
            <section class="tb-seccion">
                <h3 class="tb-titulo">Por sociedad</h3>
                <div class="tabla-scroll">
                <table class="tabla-datos tb-tabla">
                    <thead><tr>
                        <th>Sociedad</th><th>En curso</th><th>Ganadas</th><th>Perdidas</th>
                        <th>Tasa de éxito</th><th>Ofertado</th><th>Ganado</th><th>Municipios</th>
                    </tr></thead>
                    <tbody>
                        ${filas.map(s => `
                            <tr>
                                <td class="col-municipio"><span class="tabla-punto" style="background:${s.color}"></span>${escapeHtml(s.nombre)}</td>
                                <td class="col-dias">${s.vivas}</td>
                                <td class="col-dias">${s.ganadas}</td>
                                <td class="col-dias">${s.perdidas}</td>
                                <td class="col-dias">${s.tasaExito === null ? '—' : `<span class="tb-tasa ${s.tasaExito >= 50 ? 'buena' : 'floja'}">${s.tasaExito}%</span>`}</td>
                                <td class="col-monto">${s.ofertado ? formatMonto(s.ofertado) : '—'}</td>
                                <td class="col-monto">${s.ganado ? formatMonto(s.ganado) : '—'}</td>
                                <td class="col-dias">${cob[s.nombre] ? `${cob[s.nombre].inscripta} de ${cob[s.nombre].total}` : '—'}</td>
                            </tr>`).join('')}
                    </tbody>
                </table>
                </div>
            </section>`;
    },

    // ---------- Proceso ----------
    bloqueProceso(d) {
        const orden = ['oportunidad', 'en-preparacion', 'presentada', 'en-evaluacion', 'ganada', 'perdida', 'desierta', 'desistida', 'a-clasificar'];
        const porEstado = {};
        d.embudo.forEach(e => { porEstado[e.estado] = e; });
        const max = Math.max(...d.embudo.map(e => e.cantidad), 1);

        return `
            <section class="tb-seccion">
                <h3 class="tb-titulo">Cómo viene el proceso</h3>
                <div class="tb-dos">
                    <div class="tb-embudo">
                        ${orden.filter(e => porEstado[e]).map(e => `
                            <div class="tb-barra-fila">
                                <span class="tb-barra-nombre">${escapeHtml(textoEstadoLic(e))}</span>
                                <div class="tb-barra"><div class="tb-barra-llena ${e}" style="width:${(porEstado[e].cantidad / max) * 100}%"></div></div>
                                <span class="tb-barra-valor">${porEstado[e].cantidad}</span>
                            </div>`).join('')}
                    </div>
                    <div class="tb-datos-sueltos">
                        ${d.exito.tasa !== null ? `
                            <div class="tb-dato">
                                <strong>${d.exito.tasa}%</strong>
                                <span>de las resueltas las ganamos (${d.exito.ganadas} de ${d.exito.resueltas})</span>
                            </div>` : ''}
                        ${d.diasHastaResultado ? `
                            <div class="tb-dato">
                                <strong>${d.diasHastaResultado} días</strong>
                                <span>tarda en promedio el resultado desde la apertura</span>
                            </div>` : ''}
                        ${d.trabadas.length ? `
                            <div class="tb-dato alerta">
                                <strong>${d.trabadas.length}</strong>
                                <span>sin resultado hace más de 60 días</span>
                            </div>` : ''}
                    </div>
                </div>
                ${d.trabadas.length ? `
                    <div class="tb-lista-chica">
                        ${d.trabadas.slice(0, 8).map(t => `
                            <div class="tb-item">
                                <strong>${escapeHtml(t.municipio)}</strong> — ${escapeHtml(t.objeto)}
                                <span>hace ${t.dias} días${t.monto ? ` · ${formatMonto(t.monto)}` : ''}</span>
                            </div>`).join('')}
                    </div>` : ''}
            </section>`;
    },

    // ---------- Oportunidades y huecos ----------
    bloqueOportunidades(d) {
        const sinResp = d.sinResponsable || [];
        if (!d.dormidos.length && !d.sinAltaVigente.length && !sinResp.length) return '';
        return `
            <section class="tb-seccion">
                <h3 class="tb-titulo">Huecos y oportunidades</h3>
                <div class="tb-dos">
                    ${d.dormidos.length ? `
                        <div>
                            <div class="tb-subtitulo">${d.dormidos.length} municipios donde estamos inscriptos y no presentamos nada en un año</div>
                            <div class="tb-lista-chica">
                                ${d.dormidos.slice(0, 12).map(x => `<div class="tb-item"><strong>${escapeHtml(x.municipio)}</strong><span>${escapeHtml(x.sociedad)}</span></div>`).join('')}
                                ${d.dormidos.length > 12 ? `<div class="tb-mas">y ${d.dormidos.length - 12} más</div>` : ''}
                            </div>
                        </div>` : ''}
                    ${sinResp.length ? `
                        <div>
                            <div class="tb-subtitulo alerta">${sinResp.length} licitación${sinResp.length > 1 ? 'es' : ''} sin empresa responsable definida</div>
                            <div class="tb-lista-chica">
                                ${sinResp.slice(0, 12).map(x => `<div class="tb-item alerta"><strong>${escapeHtml(x.municipio)}</strong><span>${escapeHtml(x.objeto)}${x.rubro ? ' · ' + escapeHtml(x.rubro) : ''}${x.fechaApertura ? ' · abre ' + fechaLegible(x.fechaApertura) : ''}</span></div>`).join('')}
                            </div>
                        </div>` : ''}
                    ${d.sinAltaVigente.length ? `
                        <div>
                            <div class="tb-subtitulo alerta">${d.sinAltaVigente.length} con licitación abierta pero sin alta vigente</div>
                            <div class="tb-lista-chica">
                                ${d.sinAltaVigente.slice(0, 12).map(x => `<div class="tb-item alerta"><strong>${escapeHtml(x.municipio)}</strong><span>${escapeHtml(x.objeto)}</span></div>`).join('')}
                            </div>
                        </div>` : ''}
                </div>
            </section>`;
    },

    // ---------- Competencia ----------
    bloqueCompetencia(d) {
        if (!d.competidores.length) return '';
        return `
            <section class="tb-seccion">
                <h3 class="tb-titulo">Quién nos compite</h3>
                <div class="tabla-scroll">
                <table class="tabla-datos tb-tabla">
                    <thead><tr><th>Competidor</th><th>Se presentó</th><th>Ganó</th><th>Oferta promedio</th></tr></thead>
                    <tbody>
                        ${d.competidores.map(c => `
                            <tr>
                                <td class="col-municipio">${escapeHtml(c.nombre)}</td>
                                <td class="col-dias">${c.veces}</td>
                                <td class="col-dias">${c.gano ? `<span class="tb-tasa floja">${c.gano}</span>` : '—'}</td>
                                <td class="col-monto">${c.promedio ? formatMonto(c.promedio) : '—'}</td>
                            </tr>`).join('')}
                    </tbody>
                </table>
                </div>
            </section>`;
    },

    // ---------- Excel ----------
    exportarExcel() {
        if (!this.datos) { toast('Todavía no hay datos del tablero', 'warning'); return; }
        const d = this.datos;
        const campo = (v) => {
            if (v === null || v === undefined) return '';
            const s = String(v);
            return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        const num = (n) => (n === null || n === undefined) ? '' : String(n).replace('.', ',');

        const L = [];
        L.push('RESUMEN;Valor');
        L.push(`Ofertado esperando resultado;${num(d.plata.ofertadoVivo)}`);
        L.push(`Adjudicado ganado;${num(d.plata.ganado)}`);
        L.push(`Comprometido por mes;${num(d.plata.comprometidoPorMes)}`);
        L.push(`Perdido;${num(d.plata.perdido)}`);
        if (d.exito.tasa !== null) L.push(`Tasa de exito;${d.exito.tasa}%`);
        if (d.diasHastaResultado) L.push(`Dias promedio hasta el resultado;${d.diasHastaResultado}`);
        L.push('');

        L.push('POR SOCIEDAD;En curso;Ganadas;Perdidas;Tasa de exito;Ofertado;Ganado;Municipios con alta');
        d.porSociedad.forEach(s => {
            const cob = d.cobertura.find(c => c.nombre === s.nombre);
            L.push([campo(s.nombre), s.vivas, s.ganadas, s.perdidas,
                    s.tasaExito === null ? '' : s.tasaExito + '%',
                    num(s.ofertado), num(s.ganado),
                    cob ? `${cob.inscripta} de ${cob.total}` : ''].join(';'));
        });
        L.push('');

        if ((d.porRubro || []).length) {
            L.push('POR RUBRO;Licitaciones;En curso;Ganadas;Ofertado;Ganado');
            d.porRubro.forEach(r => L.push([campo(r.rubro), r.cantidad, r.vivas, r.ganadas, num(r.ofertado), num(r.ganado)].join(';')));
            L.push('');
        }

        L.push('ESTADO DEL PROCESO;Cantidad;Monto');
        d.embudo.forEach(e => L.push([campo(textoEstadoLic(e.estado)), e.cantidad, num(e.monto)].join(';')));
        L.push('');

        if (d.trabadas.length) {
            L.push('SIN RESULTADO HACE MAS DE 60 DIAS;Objeto;Dias;Ofertado');
            d.trabadas.forEach(t => L.push([campo(t.municipio), campo(t.objeto), t.dias, num(t.monto)].join(';')));
            L.push('');
        }
        if (d.dormidos.length) {
            L.push('INSCRIPTOS SIN LICITACION EN 12 MESES;Sociedad');
            d.dormidos.forEach(x => L.push([campo(x.municipio), campo(x.sociedad)].join(';')));
            L.push('');
        }
        if (d.competidores.length) {
            L.push('COMPETIDORES;Se presento;Gano;Oferta promedio');
            d.competidores.forEach(c => L.push([campo(c.nombre), c.veces, c.gano, num(c.promedio)].join(';')));
        }

        const blob = new Blob(['﻿' + L.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tablero-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast('Tablero descargado', 'success');
    }
};
