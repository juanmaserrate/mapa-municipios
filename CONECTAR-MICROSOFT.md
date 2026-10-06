# Conectar los avisos con Microsoft 365

El código ya está listo. Falta cargar las credenciales para que empiece a mandar mails.

Hay **dos caminos**. El primero es el que Microsoft recomienda y el que conviene si tenés
(o tu IT tiene) acceso de administrador. El segundo destraba hoy si no lo tenés.

---

## Camino 1 — Microsoft Graph (recomendado)

Una aplicación registrada manda los mails desde un buzón de la empresa. No usa la
contraseña de ninguna persona, así que no se rompe cuando alguien la cambia o se va.

### Lo que hay que hacer en Azure (una sola vez, ~10 minutos)

1. Entrar a **portal.azure.com** con una cuenta de administrador de Microsoft 365.
2. Buscar **Microsoft Entra ID** (antes se llamaba Azure Active Directory).
3. **Registros de aplicaciones** → **Nuevo registro**.
   - Nombre: `Mapa Comercial`
   - Tipos de cuenta: *Solo este directorio organizativo*
   - **Registrar**
4. En la pantalla que aparece, copiar estos dos valores:
   - **Id. de aplicación (cliente)** → va a ser `MS_CLIENT_ID`
   - **Id. de directorio (inquilino)** → va a ser `MS_TENANT_ID`
5. En el menú izquierdo: **Certificados y secretos** → **Nuevo secreto de cliente**.
   - Descripción: `Mapa Comercial`, vencimiento 24 meses
   - **Copiar el Valor apenas aparece**: después no se puede ver más. Va a ser `MS_CLIENT_SECRET`.
6. En el menú izquierdo: **Permisos de API** → **Agregar un permiso**
   → **Microsoft Graph** → **Permisos de aplicación** → buscar y marcar **Mail.Send**
   → **Agregar permisos**.
7. Apretar **Conceder consentimiento del administrador**. Tiene que quedar con el tilde verde.

> **Importante:** `Mail.Send` como permiso de aplicación deja mandar desde cualquier buzón
> del tenant. Si tu IT prefiere acotarlo a uno solo, se hace con una
> *Application Access Policy* en Exchange Online limitada al buzón del punto siguiente.

8. Elegir **desde qué casilla** van a salir los avisos (por ejemplo
   `avisos@realcatorce.com.ar` o la que ya usen). Tiene que ser un buzón real
   del Microsoft 365 de la empresa. Va a ser `MS_REMITENTE`.

### Lo que hay que cargar en Railway

En el proyecto `mapa-municipios` → servicio `mapa-municipios` → **Variables**:

```
MS_TENANT_ID      = el Id. de directorio del paso 4
MS_CLIENT_ID      = el Id. de aplicación del paso 4
MS_CLIENT_SECRET  = el secreto del paso 5
MS_REMITENTE      = la casilla del paso 8
CLAVE_JOBS        = una clave inventada, para que nadie dispare los avisos desde afuera
```

O por consola, desde la carpeta del proyecto:

```bash
railway variables --service mapa-municipios --set "MS_TENANT_ID=..." --set "MS_CLIENT_ID=..." --set "MS_CLIENT_SECRET=..." --set "MS_REMITENTE=avisos@realcatorce.com.ar" --set "CLAVE_JOBS=..."
```

---

## Camino 2 — SMTP de Office 365 (si no hay acceso de administrador)

Más simple, pero Microsoft lo viene restringiendo y puede dejar de andar.
Necesita que **SMTP AUTH** esté habilitado para esa casilla y una contraseña de aplicación.

```
SMTP_USUARIO = la casilla (ej: avisos@realcatorce.com.ar)
SMTP_PASSWORD = la contraseña de aplicación
```

Y en la carpeta del proyecto: `npm install nodemailer`

---

## Comprobar que funciona

1. Entrar al sitio → panel izquierdo, abajo → **Avisos por mail**.
2. Arriba tiene que decir **"Conectado con Microsoft"** en verde.
3. Cargar el correo de cada persona y tildar **Recibe**.
4. Apretar **Mandar el aviso ahora** y revisar que llegue.

---

## Que salga solo todas las mañanas

Una vez que el envío funcione, en Railway: **New** → **Empty Service** → conectar el
mismo repo → en **Settings** poner:

- **Start Command:** `node jobs/correr.js`
- **Cron Schedule:** `0 11 * * *`  (11 UTC = 8 de la mañana en Argentina)

El resumen semanal usa `0 11 * * 1` (lunes) con `TIPO_JOB=semanal`.

Alternativa sin crear otro servicio: cualquier servicio gratuito de cron
(cron-job.org) pegándole a:

```
POST https://mapa-municipios-production.up.railway.app/api/jobs/alertas?clave=LA_CLAVE_JOBS
```

---

## Qué manda

**Todos los días a la mañana, solo si hay algo:**
- Altas vencidas y altas por vencer (avisa a los 30 días, a los 7, el día del vencimiento,
  y después una vez por semana mientras siga vencida)
- Licitaciones que abren dentro de los próximos 7 días
- Licitaciones presentadas sin resultado hace más de 60 días

**Los lunes:** resumen con la plata ofertada esperando resultado, lo adjudicado ganado y
cuántas altas vencen en el mes.

Si no hay nada nuevo, no manda nada: la idea es que cuando llegue un mail, se lea.
