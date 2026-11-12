# Antebrazos 24

Web app para iPhone del plan de carga progresiva de 24 semanas para tendinopatía de antebrazo, más un plan de fuerza general en el gimnasio atado a sus fases: sesión del día con timer guiado, registro de dolor, registro de cargas con timer de series e historial, peso corporal, fases y etapas, fichas de ejercicios y guía.

HTML, CSS y JS sin build ni dependencias de npm. La única librería externa es [marked](https://marked.js.org/) (desde cdnjs) para renderizar el plan en Markdown.

## Estructura

```
index.html             página y estructura (pestañas, pantalla de detalle)
css/app.css            estilos (tokens de color claro/oscuro arriba de todo)
js/app.js              lógica: parseo de los planes, sesiones por fase y etapa, timer, registro, backup
content/plan.md        el plan de antebrazo completo; fuente de verdad del contenido
content/fuerza.md      el plan de fuerza del gimnasio (fichas G1–G27, etapas 1–4, sesiones)
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

Después de cambiar algo, subí la versión del cache en `sw.js` (por ejemplo `antebrazos24-v7` → `v8`) para que los teléfonos que ya la tienen instalada tomen los cambios.

## Datos del usuario

Todo se guarda en `localStorage` del navegador, con el prefijo `ab24:`:

| Clave | Contenido |
|---|---|
| `settings` | `{ phase: 0–4, start: "YYYY-MM-DD", sound: bool, etapa: 1–4, food: { batido: bool, creatina: bool } }` (`etapa` es la del gimnasio; si falta vale 1. `food` dice qué checks muestra la tarjeta Comida; si falta vale `{ batido: true, creatina: false }`) |
| `log:YYYY-MM-DD` | `{ checks: { "<índice>": bool }, gym: { "<código>": bool }, pain: 0–10, morning: 0–10, hours: number, sets: { "<código>": [serie] }, gymPain: 0–10, bw: number, sleep: number, food: { prot: 0–4, batido: bool, creatina: bool } }` |
| `crit` | `{ "<fase>:<índice>": bool, "g<etapa>:<índice>": bool }` criterios de avance tildados; los del gimnasio llevan el prefijo `g` (por ejemplo `g1:0`) |
| `seg` | `{ programa: "rehab" \| "gym", fichas: "rehab" \| "gym" }` último segmento elegido en Programa y Fichas |
| `units` | `{ "<código>": "kg" \| "placas" }` unidad de peso elegida por ejercicio en la pantalla de serie |
| `videos` | `{ "<url>": "ok" \| "no" }` validación de cada video desde la ficha (Sirve / No sirve) |
| `lastBackup` | fecha ISO del último backup |

Los índices de `checks` son posiciones en la lista de ejercicios del día (`PLAN` en `js/app.js`): si se reordena esa lista, los tildes viejos quedan desfasados. `gym`, en cambio, se guarda por código de ficha (`"G4"`, o `"F10"` para la ficha de rehab que entra en el día de tirón), así que reordenar una sesión no lo rompe.

### Registro de cargas

Desde Hoy, el ▶ de cada ejercicio del gimnasio abre la pantalla de serie; cada "Serie hecha" agrega una entrada a `log.sets` del día:

```json
"sets": { "G4": [ { "w": 8, "u": "kg", "r": 12 } ], "G20": [ { "w": 0, "u": "bw", "r": 30, "secs": true } ] }
```

- `w` es el peso en la unidad `u`: `"kg"`, `"placas"` (número de placa de la máquina, §2 de `fuerza.md`) o `"bw"` (peso corporal: `w` es el lastre opcional en kg, 0 si no hay). `r` son las repeticiones, o los segundos si la serie lleva `secs: true` (plancha lateral).
- La unidad por defecto sale del equipo de cada ficha (`EQUIPO` en `js/app.js`): máquinas y poleas en placas (G1, G2, G8, G9, G11, G17, G18), mancuernas en kg (G4, G6, G7, G10, G12), kettlebells en kg (G3, G13, G15, G16) y peso corporal (G5, G19, G20; G14 con lastre de kettlebell). Si se cambia kg/placas en la pantalla de serie, queda en `units`.
- El historial no se guarda aparte: se calcula recorriendo los `log:` (`allLogs`, `sesionesDe`). Las series por tiempo y por reps de un mismo código (G20: dead bug y plancha) se llevan por separado.
- Al completar las series previstas, el ejercicio queda tildado en `log.gym`. Al terminar el último de la sesión, la app pregunta la **molestia máxima de antebrazo durante el gimnasio** (0–10) y la guarda en `gymPain`; también se puede cambiar desde la tarjeta del gimnasio en Hoy.
- `bw` es el peso corporal del día (kg, con un decimal). Hoy muestra el promedio de los últimos 7 días y los promedios de 8 bloques de 7 días; si el promedio no subió 0,3 kg en 3 semanas, sugiere sumar un snack, y si subió más de 2 kg en 4 semanas, sacarlo (§3).

**Doble progresión** (§3 de `fuerza.md`): toca subir si en la sesión anterior del ejercicio todas las series anotadas llegaron al tope del rango de la sesión de hoy. El salto parte del peso más alto de esa sesión:

- Placas: +1 placa. Máquina anotada en kg: +2,5 kg.
- Mancuernas: 1 → 2 → 3 → 4 → 5 → 6 → 8 → 10 kg. Con 10 kg ya no sube el peso: el aviso pasa a "seguí sumando reps hasta 20–25", y con 25 en todas las series, a tempo lento y la variante más difícil de la ficha.
- Kettlebells: 6 → 14 → 18 kg (un peso intermedio del gimnasio salta al siguiente de la lista). Con 18 kg, el aviso es usar una kettlebell del gimnasio o el paso siguiente de la ficha. G14 usa la misma escala como lastre (sin lastre → 6 kg).
- Peso corporal sin lastre y series por tiempo: el aviso es pasar al paso siguiente de la ficha (se muestra su línea de Progresión).

Cuando toca subir, la serie arranca con el peso sugerido y el piso del rango; si no, con lo de la misma serie la última vez. Las superseries (`ss`) alternan una serie de cada ejercicio y descansan después del segundo. "Tu historial" en la ficha usa como métrica el 1RM estimado de Epley (`w × (1 + r/30)`) en la unidad más usada en las últimas 8 sesiones (en peso corporal y por tiempo, las reps o los segundos).

- **Rendimiento** (§8 y §3 de `fuerza.md`): un ejercicio está "en baja" si sus dos últimas sesiones bajaron cada una respecto de la anterior (A > B > C), comparando la mejor serie con la misma métrica de "Tu historial" y sólo en la unidad de la última sesión (`enBaja`). No cuenta como baja una sesión hecha con el freno de agarre activo (ejercicios 🟡), ni un cambio de unidad, ni un cambio de variante (la variante sale de la dosis de la sesión de ese día de la semana en la etapa actual, por ejemplo "agarre supino" en G1 de Torso B). En Hoy, la fila muestra "↓ Bajó"; con 2 o más ejercicios en baja, la tarjeta del gimnasio sugiere revisar sueño y comida (§8) y después la descarga (§3). En la pantalla de serie aparece "no fuerces subir hoy" y no se sugiere subir peso.

### Sueño y comida

- `sleep` son las horas de sueño de la noche anterior (pasos de 0,5 h, de 0 a 12); la primera tocada propone el último registro, o 7. Si en 3 o más de las últimas 5 noches registradas dormiste menos de 7 h, la tarjeta de registro muestra un aviso con link a la §8. En Programa → Gimnasio, el criterio "Dormís 7 h o más…" de la Etapa 2 muestra el promedio de las últimas 7 noches registradas.
- `food` es el checklist de la §9 en la tarjeta Comida de Hoy: `prot` cuenta las comidas con 25–35 g de proteína (0–4), `batido` y `creatina` son checks. Batido y creatina sólo se muestran si están activados en Ajustes → Comida (`settings.food`); la creatina viene apagada porque el plan la marca como opcional.

### Plan de fuerza

`content/fuerza.md` se carga en paralelo con `plan.md` y se parsea igual: secciones `## N · Título`, fichas `#### Gn · Nombre` en la §4 (agrupadas por los `### Torso` / `### Piernas y core`), etapas en la §5 (línea con el número + `###`, como las fases) y la entrada en calor de la §6. La línea en cursiva bajo cada ficha trae el nombre en inglés y los tags; el semáforo 🟢/🟡 se muestra como tag de color. Si el archivo no carga, la app funciona igual sin el gimnasio.

En Fichas → Gimnasio, las fichas que no aparecen en ninguna sesión de `GYM` (se calcula, `EN_SESION`) van a un grupo final **Alternativas**, y su ficha lleva el tag "Alternativa". Su historial y sus videos funcionan igual.

Las sesiones por etapa y día (`GYM` en `js/app.js`) son datos puros: cada ejercicio es `{ g: "G4", dose: "3×8–12 · 120 s", sets: 3, reps: [8, 12], rest: 120 }` (con `secs` en vez de `reps` si la serie es por tiempo, `lado: true` si es por lado o por pierna y `ss` con el código de su pareja de superserie). Esos valores numéricos son los que usa el registro de cargas y el timer de series. La etapa elegida se compara con la fase de antebrazo (`ETAPA_FASE`) para mostrar un aviso en Ajustes si no coinciden.

### Videos de referencia

`content/videos.json` tiene la forma `{ "version": 1, "videos": [ … ] }`. Cada video lleva `ficha` (1–12 para las de recuperación, como número; `"G1"`–`"G20"` para las del gimnasio, como texto: la app compara normalizando a código), `titulo` y `canal` (los que devuelve el oEmbed de YouTube), `url`, `idioma` (`es` o `en`), `nota` (qué mirar y en qué difiere de la ficha) y `estado`. Se muestran en la ficha, después de la dosis, en el orden del archivo.

Para curarlos: el usuario marca cada video con **Sirve** o **No sirve** desde la app (queda en la clave `videos` del dispositivo y viaja en el backup). Después se pasa esa decisión al JSON cambiando `estado` de `"pendiente"` a `"sirve"` o `"descartado"`, o se borra la entrada. La app hoy no lee `estado`: es para llevar la cuenta en el repo. La validación se guarda por `url` (algunas llevan `&t=` para arrancar en el minuto justo), así que si cambiás una URL se pierde su marca. Si el archivo no carga, la app funciona igual sin la sección de videos.

### Formato del backup

Ajustes → Copia de seguridad genera un `.json` con esta forma. Es el contrato a respetar si se migra a otra tecnología, para poder restaurar backups viejos. Exporta todas las claves `ab24:`, así que las claves y campos nuevos (`settings.etapa`, `log.gym`, `log.sets`, `log.gymPain`, `log.bw`, `log.sleep`, `log.food`, `settings.food`, `units`, criterios `g…`, `seg`) viajan solos sin cambiar `version: 1`:

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

### Freno de agarre (§1 del plan de fuerza)

Se calcula, no se guarda. Si el día siguiente a una sesión con series de ejercicios 🟡 el dolor al despertar (`morning`) supera tu línea de base, durante 7 días los 🟡 bajan a 2 series y no se sugiere subir peso. La línea de base es la mediana de los `morning` de los 14 días previos (mínimo 3 registros); si no hay suficientes, se usa 3/10. Si eso pasa dos semanas seguidas, Hoy sugiere volver una etapa.
