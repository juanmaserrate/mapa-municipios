// ============================================================
// Lista canónica de municipios
// ============================================================
// Generada desde data/partidos-buenos-aires.geojson. El `id` es el mismo
// `properties.id` del geojson: es la identidad real del municipio.
//
// POR QUE EXISTE ESTE ARCHIVO:
// Antes las inscripciones guardaban el nombre del municipio como texto y se
// comparaban con includes(), asi que "Pila" matcheaba con "Pilar" y "Monte"
// con "Monte Hermoso" y "General Viamonte". Pilar se pintaba de verde
// mostrando el monto y el vencimiento de Pila. Ahora todo apunta al id.
//
// Lezama se suma a mano: es el partido 135 de la provincia (separado de
// Chascomus en 2009) y el geojson todavia no trae su limite.

const MUNICIPIOS = [
    { id: 100, nombre: '25 de Mayo' },
    { id: 101, nombre: '9 de Julio' },
    { id: 379, nombre: 'Adolfo Alsina' },
    { id: 135, nombre: 'Adolfo Gonzales Chaves' },
    { id: 90, nombre: 'Alberti' },
    { id: 89, nombre: 'Almirante Brown' },
    { id: 51, nombre: 'Arrecifes' },
    { id: 149, nombre: 'Avellaneda' },
    { id: 123, nombre: 'Ayacucho' },
    { id: 118, nombre: 'Azul' },
    { id: 139, nombre: 'Bahia Blanca' },
    { id: 134, nombre: 'Balcarce' },
    { id: 169, nombre: 'Baradero' },
    { id: 132, nombre: 'Benito Juarez' },
    { id: 148, nombre: 'Berazategui' },
    { id: 146, nombre: 'Berisso' },
    { id: 113, nombre: 'Bolivar' },
    { id: 81, nombre: 'Bragado' },
    { id: 98, nombre: 'Brandsen' },
    { id: 9999, nombre: 'CABA' },
    { id: 168, nombre: 'Campana' },
    { id: 54, nombre: 'Capitan Sarmiento' },
    { id: 105, nombre: 'Carlos Casares' },
    { id: 99, nombre: 'Carlos Tejedor' },
    { id: 57, nombre: 'Carmen de Areco' },
    { id: 162, nombre: 'Castelli' },
    { id: 95, nombre: 'Cañuelas' },
    { id: 63, nombre: 'Chacabuco' },
    { id: 145, nombre: 'Chascomus' },
    { id: 80, nombre: 'Chivilcoy' },
    { id: 175, nombre: 'Colon' },
    { id: 141, nombre: 'Coronel Dorrego' },
    { id: 136, nombre: 'Coronel Pringles' },
    { id: 130, nombre: 'Coronel Suarez' },
    { id: 138, nombre: 'Coronel de Marina Leonardo Rosales' },
    { id: 119, nombre: 'Daireaux' },
    { id: 116, nombre: 'Dolores' },
    { id: 147, nombre: 'Ensenada' },
    { id: 58, nombre: 'Escobar' },
    { id: 87, nombre: 'Esteban Echeverria' },
    { id: 56, nombre: 'Exaltacion de la Cruz' },
    { id: 88, nombre: 'Ezeiza' },
    { id: 91, nombre: 'Florencio Varela' },
    { id: 77, nombre: 'Florentino Ameghino' },
    { id: 144, nombre: 'General Alvarado' },
    { id: 111, nombre: 'General Alvear' },
    { id: 399, nombre: 'General Arenales' },
    { id: 109, nombre: 'General Belgrano' },
    { id: 121, nombre: 'General Guido' },
    { id: 127, nombre: 'General Juan Madariaga' },
    { id: 86, nombre: 'General Las Heras' },
    { id: 160, nombre: 'General Lavalle' },
    { id: 102, nombre: 'General Paz' },
    { id: 152, nombre: 'General Pinto' },
    { id: 155, nombre: 'General Pueyrredon' },
    { id: 70, nombre: 'General Rodriguez' },
    { id: 66, nombre: 'General San Martin' },
    { id: 85, nombre: 'General Viamonte' },
    { id: 396, nombre: 'General Villegas' },
    { id: 129, nombre: 'General la Madrid' },
    { id: 124, nombre: 'Guamini' },
    { id: 115, nombre: 'Hipolito Yrigoyen' },
    { id: 73, nombre: 'Hurlingham' },
    { id: 76, nombre: 'Ituzaingo' },
    { id: 65, nombre: 'Jose C Paz' },
    { id: 60, nombre: 'Junin' },
    { id: 159, nombre: 'La Costa' },
    { id: 78, nombre: 'La Matanza' },
    { id: 93, nombre: 'La Plata' },
    { id: 82, nombre: 'Lanus' },
    { id: 131, nombre: 'Laprida' },
    { id: 110, nombre: 'Las Flores' },
    { id: 398, nombre: 'Leandro N Alem' },
    { id: 75, nombre: 'Lincoln' },
    { id: 143, nombre: 'Loberia' },
    { id: 97, nombre: 'Lobos' },
    { id: 84, nombre: 'Lomas de Zamora' },
    { id: 62, nombre: 'Lujan' },
    { id: 164, nombre: 'Magdalena' },
    { id: 126, nombre: 'Maipu' },
    { id: 64, nombre: 'Malvinas Argentinas' },
    { id: 156, nombre: 'Mar Chiquita' },
    { id: 83, nombre: 'Marcos Paz' },
    { id: 68, nombre: 'Mercedes' },
    { id: 79, nombre: 'Merlo' },
    { id: 103, nombre: 'Monte' },
    { id: 140, nombre: 'Monte Hermoso' },
    { id: 69, nombre: 'Moreno' },
    { id: 74, nombre: 'Moron' },
    { id: 92, nombre: 'Navarro' },
    { id: 142, nombre: 'Necochea' },
    { id: 122, nombre: 'Olavarria' },
    { id: 391, nombre: 'Patagones' },
    { id: 107, nombre: 'Pehuajo' },
    { id: 381, nombre: 'Pellegrini' },
    { id: 174, nombre: 'Pergamino' },
    { id: 112, nombre: 'Pila' },
    { id: 61, nombre: 'Pilar' },
    { id: 158, nombre: 'Pinamar' },
    { id: 94, nombre: 'Presidente Peron' },
    { id: 382, nombre: 'Puan' },
    { id: 163, nombre: 'Punta Indio' },
    { id: 165, nombre: 'Quilmes' },
    { id: 172, nombre: 'Ramallo' },
    { id: 117, nombre: 'Rauch' },
    { id: 380, nombre: 'Rivadavia' },
    { id: 52, nombre: 'Rojas' },
    { id: 104, nombre: 'Roque Perez' },
    { id: 133, nombre: 'Saavedra' },
    { id: 106, nombre: 'Saladillo' },
    { id: 125, nombre: 'Salliquelo' },
    { id: 55, nombre: 'Salto' },
    { id: 59, nombre: 'San Andres de Giles' },
    { id: 53, nombre: 'San Antonio de Areco' },
    { id: 153, nombre: 'San Cayetano' },
    { id: 167, nombre: 'San Fernando' },
    { id: 150, nombre: 'San Isidro' },
    { id: 67, nombre: 'San Miguel' },
    { id: 173, nombre: 'San Nicolas' },
    { id: 171, nombre: 'San Pedro' },
    { id: 96, nombre: 'San Vicente' },
    { id: 71, nombre: 'Suipacha' },
    { id: 128, nombre: 'Tandil' },
    { id: 114, nombre: 'Tapalque' },
    { id: 151, nombre: 'Tigre' },
    { id: 161, nombre: 'Tordillo' },
    { id: 137, nombre: 'Tornquist' },
    { id: 108, nombre: 'Trenque Lauquen' },
    { id: 154, nombre: 'Tres Arroyos' },
    { id: 120, nombre: 'Tres Lomas' },
    { id: 72, nombre: 'Tres de Febrero' },
    { id: 166, nombre: 'Vicente Lopez' },
    { id: 157, nombre: 'Villa Gesell' },
    { id: 383, nombre: 'Villarino' },
    { id: 170, nombre: 'Zarate' },
    // Partido 135 de la provincia: todavia no esta dibujado en el mapa
    { id: 9998, nombre: 'Lezama', sinGeometria: true },
];

// Indices para buscar rapido, armados una sola vez
const MUNICIPIOS_POR_ID = {};
const MUNICIPIOS_POR_NOMBRE = {};

MUNICIPIOS.forEach(m => {
    MUNICIPIOS_POR_ID[m.id] = m;
    MUNICIPIOS_POR_NOMBRE[normalizarNombreMunicipio(m.nombre)] = m;
});

function normalizarNombreMunicipio(s) {
    return (s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Resuelve un nombre escrito a su municipio. SOLO coincidencia exacta:
// si no coincide devuelve null y el dato queda para que lo revise una persona.
function resolverMunicipio(nombre) {
    return MUNICIPIOS_POR_NOMBRE[normalizarNombreMunicipio(nombre)] || null;
}

function nombreMunicipio(id) {
    const m = MUNICIPIOS_POR_ID[id];
    return m ? m.nombre : '';
}
