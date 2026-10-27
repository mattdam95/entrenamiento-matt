# Antebrazos 24

Web app para iPhone del plan de carga progresiva de 24 semanas para tendinopatía de antebrazo, más un plan de fuerza general en el gimnasio atado a sus fases: sesión del día con timer guiado, registro de dolor, fases y etapas, fichas de ejercicios y guía.

HTML, CSS y JS sin build ni dependencias de npm. La única librería externa es [marked](https://marked.js.org/) (desde cdnjs) para renderizar el plan en Markdown.

## Estructura

```
index.html             página y estructura (pestañas, pantalla de detalle)
css/app.css            estilos (tokens de color claro/oscuro arriba de todo)
js/app.js              lógica: parseo de los planes, sesiones por fase y etapa, timer, registro, backup
content/plan.md        el plan de antebrazo completo; fuente de verdad del contenido
content/fuerza.md      el plan de fuerza del gimnasio (fichas G1–G20, etapas 1–4, sesiones)
content/videos.json    videos de referencia (links de YouTube) por ficha, para validar desde la app
manifest.webmanifest   para "Agregar a inicio" (pantalla completa)
sw.js                  service worker: funciona sin conexión
icons/                 ícono de la app
.nojekyll              evita que GitHub Pages procese los .md con Jekyll
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

Después de cambiar algo, subí la versión del cache en `sw.js` (por ejemplo `antebrazos24-v6` → `v7`) para que los teléfonos que ya la tienen instalada tomen los cambios.

## Datos del usuario

Todo se guarda en `localStorage` del navegador, con el prefijo `ab24:`:

| Clave | Contenido |
|---|---|
| `settings` | `{ phase: 0–4, start: "YYYY-MM-DD", sound: bool, etapa: 1–4 }` (`etapa` es la del gimnasio; si falta vale 1) |
| `log:YYYY-MM-DD` | `{ checks: { "<índice>": bool }, gym: { "<código>": bool }, pain: 0–10, morning: 0–10, hours: number }` |
| `crit` | `{ "<fase>:<índice>": bool, "g<etapa>:<índice>": bool }` criterios de avance tildados; los del gimnasio llevan el prefijo `g` (por ejemplo `g1:0`) |
| `seg` | `{ programa: "rehab" \| "gym", fichas: "rehab" \| "gym" }` último segmento elegido en Programa y Fichas |
| `videos` | `{ "<url>": "ok" \| "no" }` validación de cada video desde la ficha (Sirve / No sirve) |
| `lastBackup` | fecha ISO del último backup |

Los índices de `checks` son posiciones en la lista de ejercicios del día (`PLAN` en `js/app.js`): si se reordena esa lista, los tildes viejos quedan desfasados. `gym`, en cambio, se guarda por código de ficha (`"G4"`, o `"F10"` para la ficha de rehab que entra en el día de tirón), así que reordenar una sesión no lo rompe.

### Plan de fuerza

`content/fuerza.md` se carga en paralelo con `plan.md` y se parsea igual: secciones `## N · Título`, fichas `#### Gn · Nombre` en la §4 (agrupadas por los `### Torso` / `### Piernas y core`), etapas en la §5 (línea con el número + `###`, como las fases) y la entrada en calor de la §6. La línea en cursiva bajo cada ficha trae el nombre en inglés y los tags; el semáforo 🟢/🟡 se muestra como tag de color. Si el archivo no carga, la app funciona igual sin el gimnasio.

Las sesiones por etapa y día (`GYM` en `js/app.js`) son datos puros: cada ejercicio es `{ g: "G4", dose: "3×8–12 · 120 s", sets: 3, reps: [8, 12], rest: 120 }` (con `secs` en vez de `reps` si la serie es por tiempo, `lado: true` si es por lado o por pierna y `ss` con el código de su pareja de superserie). Los valores numéricos quedan listos para el registro de cargas y el timer de series. La etapa elegida se compara con la fase de antebrazo (`ETAPA_FASE`) para mostrar un aviso en Ajustes si no coinciden.

### Videos de referencia

`content/videos.json` tiene la forma `{ "version": 1, "videos": [ … ] }`. Cada video lleva `ficha` (1–12), `titulo` y `canal` (los que devuelve el oEmbed de YouTube), `url`, `idioma` (`es` o `en`), `nota` (qué mirar y en qué difiere de la ficha) y `estado`. Se muestran en la ficha, después de la dosis, en el orden del archivo.

Para curarlos: el usuario marca cada video con **Sirve** o **No sirve** desde la app (queda en la clave `videos` del dispositivo y viaja en el backup). Después se pasa esa decisión al JSON cambiando `estado` de `"pendiente"` a `"sirve"` o `"descartado"`, o se borra la entrada. La app hoy no lee `estado`: es para llevar la cuenta en el repo. La validación se guarda por `url` (algunas llevan `&t=` para arrancar en el minuto justo), así que si cambiás una URL se pierde su marca. Si el archivo no carga, la app funciona igual sin la sección de videos.

### Formato del backup

Ajustes → Copia de seguridad genera un `.json` con esta forma. Es el contrato a respetar si se migra a otra tecnología, para poder restaurar backups viejos. Exporta todas las claves `ab24:`, así que las claves y campos nuevos (`settings.etapa`, `log.gym`, criterios `g…`, `seg`) viajan solos sin cambiar `version: 1`:

```json
{
  "app": "antebrazos24",
  "version": 1,
  "exportedAt": "2026-10-27T15:00:00.000Z",
  "data": { "settings": { "phase": 1, "start": "2026-10-20", "sound": true }, "log:2026-10-27": { "pain": 2 } }
}
```

## Migrar a otra tecnología

- El contenido ya está separado (`content/plan.md`, `content/fuerza.md`); el parseo de secciones (`## N · Título`), fichas (`#### N · Nombre` / `#### Gn · Nombre`) y fases o etapas (línea con el número + `###`) está al principio de `js/app.js` (`parseDoc`, `parseFichas`, `parseStages`).
- Las sesiones por fase y día (`PLAN`), las del gimnasio por etapa y día (`GYM`) y las especificaciones del timer (`TEMPO`, `WARM`, etc.) son datos puros, fáciles de pasar a JSON.
- Mantener el formato del backup (`version: 1`) o escribir un importador desde él.

---

Orientativo: no reemplaza la indicación de un traumatólogo o kinesiólogo.
