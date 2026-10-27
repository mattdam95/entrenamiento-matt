# Antebrazos 24

Web app para iPhone del plan de carga progresiva de 24 semanas para tendinopatía de antebrazo: sesión del día con timer guiado, registro de dolor, fases, fichas de ejercicios y guía.

HTML, CSS y JS sin build ni dependencias de npm. La única librería externa es [marked](https://marked.js.org/) (desde cdnjs) para renderizar el plan en Markdown.

## Estructura

```
index.html             página y estructura (pestañas, pantalla de detalle)
css/app.css            estilos (tokens de color claro/oscuro arriba de todo)
js/app.js              lógica: parseo del plan, sesiones por fase, timer, registro, backup
content/plan.md        el plan completo; fuente de verdad del contenido
content/videos.json    videos de referencia (links de YouTube) por ficha, para validar desde la app
manifest.webmanifest   para "Agregar a inicio" (pantalla completa)
sw.js                  service worker: funciona sin conexión
icons/                 ícono de la app
.nojekyll              evita que GitHub Pages procese plan.md con Jekyll
```

## Correr en local

`fetch` no funciona abriendo el archivo directo (`file://`), así que hace falta un servidor:

```sh
python -m http.server 8000
# http://localhost:8000
```

Para probarlo en el iPhone dentro de la misma red: `http://<ip-de-la-pc>:8000`.

## Publicar en GitHub Pages

Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)`. Publicado en https://mattdam95.github.io/entrenamiento-matt/

Después de cambiar algo, subí la versión del cache en `sw.js` (por ejemplo `antebrazos24-v4` → `v5`) para que los teléfonos que ya la tienen instalada tomen los cambios.

## Datos del usuario

Todo se guarda en `localStorage` del navegador, con el prefijo `ab24:`:

| Clave | Contenido |
|---|---|
| `settings` | `{ phase: 0–4, start: "YYYY-MM-DD", sound: bool }` |
| `log:YYYY-MM-DD` | `{ checks: { "<índice>": bool }, pain: 0–10, morning: 0–10, hours: number }` |
| `crit` | `{ "<fase>:<índice>": bool }` criterios de avance tildados |
| `videos` | `{ "<url>": "ok" \| "no" }` validación de cada video desde la ficha (Sirve / No sirve) |
| `lastBackup` | fecha ISO del último backup |

Los índices de `checks` son posiciones en la lista de ejercicios del día (`PLAN` en `js/app.js`): si se reordena esa lista, los tildes viejos quedan desfasados.

### Videos de referencia

`content/videos.json` tiene la forma `{ "version": 1, "videos": [ … ] }`. Cada video lleva `ficha` (1–12), `titulo` y `canal` (los que devuelve el oEmbed de YouTube), `url`, `idioma` (`es` o `en`), `nota` (qué mirar y en qué difiere de la ficha) y `estado`. Se muestran en la ficha, después de la dosis, en el orden del archivo.

Para curarlos: el usuario marca cada video con **Sirve** o **No sirve** desde la app (queda en la clave `videos` del dispositivo y viaja en el backup). Después se pasa esa decisión al JSON cambiando `estado` de `"pendiente"` a `"sirve"` o `"descartado"`, o se borra la entrada. La app hoy no lee `estado`: es para llevar la cuenta en el repo. La validación se guarda por `url` (algunas llevan `&t=` para arrancar en el minuto justo), así que si cambiás una URL se pierde su marca. Si el archivo no carga, la app funciona igual sin la sección de videos.

### Formato del backup

Ajustes → Copia de seguridad genera un `.json` con esta forma. Es el contrato a respetar si se migra a otra tecnología, para poder restaurar backups viejos:

```json
{
  "app": "antebrazos24",
  "version": 1,
  "exportedAt": "2026-10-27T15:00:00.000Z",
  "data": { "settings": { "phase": 1, "start": "2026-10-20", "sound": true }, "log:2026-10-27": { "pain": 2 } }
}
```

## Migrar a otra tecnología

- El contenido ya está separado (`content/plan.md`); el parseo de secciones (`## N · Título`), fichas (`#### N · Nombre`) y fases (línea con el número + `###`) está al principio de `js/app.js`.
- Las sesiones por fase y día (`PLAN`) y las especificaciones del timer (`TEMPO`, `WARM`, etc.) son datos puros, fáciles de pasar a JSON.
- Mantener el formato del backup (`version: 1`) o escribir un importador desde él.

---

Orientativo: no reemplaza la indicación de un traumatólogo o kinesiólogo.
