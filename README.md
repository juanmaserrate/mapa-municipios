# Mapa Comercial - Municipios Buenos Aires

Sitio web interactivo para que el área comercial gestione el estado de inscripción de clientes en municipios y organismos de compra.

## Que hace

- Mapa interactivo de Buenos Aires con pines de clientes
- Cada pin muestra una bandera con el nombre del cliente
- 3 estados: **Inscripto** (verde), **Concursando** (amarillo), **No inscripto** (rojo)
- Para cada pin podes guardar: descripción, notas internas, archivos adjuntos (PDFs, imágenes, etc.)
- Filtros por estado y por cliente en la barra lateral
- Búsqueda por municipio, cliente o texto en notas
- Agregar nuevos pines clickeando en cualquier parte del mapa
- Agregar nuevos clientes con su color identificador
- Exportar / importar todos los datos como JSON (para hacer backups o compartir)

## Como usar

1. Abrí `index.html` en tu navegador (Chrome / Edge / Firefox)
2. Los datos se guardan automáticamente en el navegador (localStorage)
3. Para compartir los datos con otro usuario: **Exportar** → enviar archivo `.json` → el otro usuario hace **Importar**

## Como subir a GitHub (gratis, paso a paso)

### Opción 1: Desde la web (más simple, sin instalar nada)

1. Andá a https://github.com y creá una cuenta si no tenés
2. Click en el botón verde **"New"** (arriba a la izquierda) para crear un repositorio nuevo
3. Ponele un nombre, por ejemplo `mapa-comercial`
4. Marcá **"Public"**
5. Click **"Create repository"**
6. En la siguiente pantalla, click en **"uploading an existing file"**
7. Arrastrá toda la carpeta `mapa-municipios` (con sus subcarpetas `css/` y `js/`)
8. Click **"Commit changes"**

### Activar el sitio web (GitHub Pages)

1. Dentro del repositorio, click en **"Settings"** (arriba a la derecha)
2. En el menú lateral, click en **"Pages"**
3. En "Source", seleccioná **"Deploy from a branch"**
4. En "Branch", seleccioná **"main"** y carpeta **"/ (root)"**
5. Click **"Save"**
6. Esperá 1-2 minutos. Tu sitio va a estar en:
   `https://TU-USUARIO.github.io/mapa-comercial/`

### Opción 2: Con Git (línea de comandos)

```bash
cd mapa-municipios
git init
git add .
git commit -m "Sitio inicial"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/mapa-comercial.git
git push -u origin main
```

Después activar GitHub Pages como en la opción 1.

## Estructura de archivos

```
mapa-municipios/
├── index.html        ← Estructura del sitio
├── css/
│   └── style.css     ← Estilos visuales
├── js/
│   ├── data.js       ← Datos iniciales (municipios, clientes)
│   └── app.js        ← Lógica de la app
└── README.md         ← Este archivo
```

## Importante sobre los datos

Los datos se guardan en el **navegador de cada persona** (localStorage). Esto significa:

- Cada usuario ve sus propios datos
- Si limpiás el caché del navegador, perdés los datos (por eso es importante **exportar** seguido)
- Para compartir datos entre el equipo: usar **Exportar / Importar** del JSON

Si en el futuro querés que todo el equipo vea los mismos datos en tiempo real, hay que sumar un backend (Firebase, Supabase, o tu propio servidor en Railway). Eso se puede agregar después.

## Personalización

- **Cambiar el centro del mapa:** editar `js/app.js` línea con `center: [-34.65, -58.55]`
- **Agregar más municipios pre-cargados:** editar `js/data.js`
- **Cambiar colores de los estados:** editar `css/style.css` las variables `--status-*`
