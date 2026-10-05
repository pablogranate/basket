# Plan: Manual técnico — Reportar incidencias

Documento de plan para Claude Design. Genera un segundo manual PDF, hermano de `docs/manual usuarios.pdf`, dirigido **solo a técnicos** y que cubre **únicamente la sección de reportes (incidencias) dentro de /mi-jornada**.

## Reglas de alcance

- **No repetir** nada del manual de colaboradores: login, enlace de acceso, formulario de solicitud, instalar la PWA, leer la tarjeta, aceptar el partido. Se asume que el técnico ya entra al portal y ve sus partidos.
- Cubrir solo: abrir el reporte desde la tarjeta del partido, completar el formulario, guardar borrador, enviar, y verificar el estado "Reportado".
- Nada de pantallas de administración (/reports, /incidents): eso no lo ve el técnico.

## Estilo — copiar EXACTAMENTE el manual existente

Referencia visual: `docs/manual usuarios.pdf`. Reproducir:

- **Cabecera de portada**: kicker en mayúsculas espaciadas gris `BASQUETPASS · MANUAL TÉCNICO`, logo BASKET.TV rojo arriba a la derecha.
- **Título** grande en negro (peso extra-bold), tipografía redondeada tipo Poppins/Baloo como el original.
- **Bajada** en gris de una o dos líneas, luego línea `Portal: portal.basket-app.com` con el enlace en rojo subrayado.
- **Índice**: lista numerada con el número en rojo y regla horizontal arriba y abajo.
- **Secciones**: encabezado `N.` en rojo + título en negro bold.
- **Capturas**: imagen con borde/marco gris suave y **leyenda en gris itálica-light debajo** (una o dos líneas explicando qué se ve).
- **Negritas** para nombres exactos de botones y campos (`**Reportar**`, `**Enviar**`); comillas angulares «…» para textos que aparecen en pantalla.
- **Callout**: bloque gris con barra vertical roja a la izquierda para advertencias clave (como el del correo atado a producción en el original).
- **Tabla final** de dos columnas `LO QUE VES / QUÉ HACER` con encabezados en mayúsculas espaciadas grises.
- **Pie**: `BasquetPass · Manual técnico.`
- Tono: voseo argentino, frases cortas, imperativo («Tocá», «Escribí», «Subí»). Formato A4 vertical, ~5–6 páginas.

## Portada

- Kicker: `BASQUETPASS · MANUAL TÉCNICO`
- Título: **Reportar incidencias**
- Bajada: "Cómo cargar el parte técnico del partido desde tu celular. Se hace al terminar, tarda cinco minutos."
- `Portal: portal.basket-app.com`

## Índice

1. Abrir el reporte
2. Estado general
3. Observaciones
4. Contexto del partido
5. Prueba de envío de señal
6. Problemas detectados
7. Bloque técnico
8. Guardar, editar y enviar
9. Si algo no funciona

---

## 1. Abrir el reporte

Contenido:
- En **Mi jornada**, cada tarjeta de partido tiene dos botones al pie: **Grupo** (verde) y **Reportar** (rojo, ícono de megáfono).
- Tocá **Reportar**: se abre el parte del partido como panel a pantalla completa, con la cabecera del partido (liga, equipos, fecha, hora, sede) y una **X** para cerrar.
- Aclarar: el reporte es **uno por partido asignado**. Si lo volvés a enviar, pisa el anterior.

📸 **CAPTURA 1** — Tarjeta de partido en /mi-jornada (celular) con los botones **Grupo** y **Reportar** visibles al pie. Leyenda: "El botón rojo Reportar abre el parte del partido."

📸 **CAPTURA 2** — El panel de reporte recién abierto (cabecera del partido + primeras secciones del formulario). Leyenda: "El parte se abre encima de tu jornada. Cerralo con la X sin perder lo cargado."

## 2. Estado general

Contenido:
- **Tipo de incidencia**: cuatro opciones — **Sin / Baja / Alta / Crítica**. Explicar criterio corto de cada una (Sin = salió todo bien; Baja = hubo un detalle que no afectó la transmisión; Alta = afectó la transmisión; Crítica = se cayó o no salió al aire).
- **Feed detectó**: botón SI/NO (por defecto SI). Explicar qué significa en una línea.
- Callout (bloque gris con barra roja): "Si elegís algo distinto de «Sin», las Observaciones pasan a ser obligatorias. El formulario no envía sin ellas."

📸 **CAPTURA 3** — Sección "Estado general" con una severidad seleccionada (ej. Alta en rojo). Leyenda: "Elegí la gravedad real: esto ordena la revisión del día siguiente."

## 3. Observaciones

Contenido:
- Aparece solo cuando el tipo de incidencia no es «Sin».
- Qué escribir: qué pasó, en qué momento del partido, y si se resolvió. Usar el ejemplo del placeholder: «Se cayó la cámara 1 en dos momentos y la VM tardó en responder».
- Regla exacta: si está vacío, al enviar aparece «Completa las observaciones antes de enviar una incidencia.»

📸 **CAPTURA 4** — Sección "Observaciones" desplegada con texto de ejemplo cargado. Leyenda: "Detallá la incidencia: qué, cuándo y si se resolvió."

## 4. Contexto del partido

Contenido:
- **Señal**: desplegable con la combinación de señales que salió al aire (BP, BP/FDC, FDC/DTV, etc.). Elegí la que corresponde al partido.
- **Apto lineal**: SI/NO.

📸 **CAPTURA 5** — Sección "Contexto del partido" con el desplegable de Señal abierto mostrando las opciones. Leyenda: "Elegí la combinación exacta de señales del partido."

## 5. Prueba de envío de señal

Contenido:
- **Hora**: a qué hora se hizo la prueba de señal (opcional pero recomendado).
- Cinco controles SI/NO: **Prueba**, **Sonido**, **Gráfica**, **Internet**, **Tiro de cámara**. Verde = OK, rojo = falló o no se probó. Por defecto arrancan en NO: marcá SI en lo que salió bien.

📸 **CAPTURA 6** — Sección "Prueba Envío señal" con hora cargada y toggles mezclados (algunos SI en verde, alguno NO en rojo). Leyenda: "Marcá SI solo en lo que verificaste bien."

## 6. Problemas detectados

Contenido:
- Chips múltiples (podés marcar varios o ninguno): **Internet, FDC, Overlay, GES, Gráfica, Club, Responsable de cancha**.
- Sirven para clasificar el origen del problema; el detalle va en Observaciones.

📸 **CAPTURA 7** — Sección "Problemas detectados" con dos o tres chips marcados. Leyenda: "Marcá todas las áreas que fallaron; el detalle va en Observaciones."

## 7. Bloque técnico

Contenido:
- Tres capturas para subir: **Speed Test**, **Ping** y **GPU**. Tocá cada recuadro y elegí **Tomar foto** o **Subir desde galería** (la imagen se comprime sola).
- Abajo, escribí el **número** de cada medición en su campo (ej. 22.1 / 60 ms / 40%). El número es lo que queda en el reporte: no dependas solo de la foto.

📸 **CAPTURA 8** — Sección "Bloque técnico" con los tres recuadros de foto y los tres campos numéricos completados. Leyenda: "Sacá la foto y escribí el valor abajo. El número es obligatorio de cargar a mano."

📸 **CAPTURA 9** — El selector inferior "Tomar foto / Subir desde galería" abierto. Leyenda: "Podés usar la cámara o la galería del celular."

## 8. Guardar, editar y enviar

Contenido:
- Tres botones al pie: **Guardar** (guarda borrador **en este dispositivo**), **Editar** (abre el parte en página completa) y **Enviar** (envía el reporte definitivo).
- El formulario además guarda solo mientras escribís: «Cambios guardados automáticamente.» Si cerrás y volvés a abrir, retomás donde quedaste — pero **solo en el mismo celular**.
- Al enviar con éxito: «Reporte enviado. Marcamos este partido como reportado.» El partido queda como **Reportado** en tu jornada.
- Si algo estaba mal y ya enviaste: abrí el reporte de nuevo, corregí y volvé a **Enviar**. El nuevo envío reemplaza al anterior.

📸 **CAPTURA 10** — Pie del formulario con los botones **Guardar / Editar / Enviar** y el mensaje de estado. Leyenda: "Guardar deja un borrador en tu celular; Enviar manda el reporte definitivo."

📸 **CAPTURA 11** — Estado del partido en «Reportado» (verde) en la planilla/tarjeta de Mi jornada después de enviar. Leyenda: "Así queda el partido cuando el reporte entró bien."

## 9. Si algo no funciona

Tabla dos columnas, mismo formato que el original (`LO QUE VES / QUÉ HACER`):

| Lo que ves | Qué hacer |
|---|---|
| «Completa las observaciones antes de enviar una incidencia.» | Elegiste una incidencia (Baja/Alta/Crítica) sin detallar. Escribí qué pasó en Observaciones y volvé a enviar. |
| «No pudimos enviar el reporte en este momento.» | Falló la conexión. Tu borrador queda guardado: esperá señal y tocá **Enviar** de nuevo. |
| «No tienes acceso a este partido para enviar el reporte.» | Tu usuario no está vinculado a esa asignación. Escribí a producción. |
| Envié y sigue «Pendiente de reporte» | Recargá la pantalla. Si sigue, el envío no entró: abrí el parte y tocá **Enviar** otra vez. |
| Cargué todo en un celular y en otro no aparece | El borrador se guarda por dispositivo. Terminá y enviá desde el mismo celular donde empezaste. |
| Me equivoqué y ya envié | Abrí el reporte de nuevo, corregí y enviá. El nuevo reemplaza al anterior. |

Pie de página: `BasquetPass · Manual técnico.`

---

## Checklist de capturas (para tomar en el celular, misma escala que el manual original)

| # | Pantalla | Estado a preparar |
|---|---|---|
| 1 | /mi-jornada, tarjeta con botones Grupo/Reportar | Partido asignado visible |
| 2 | Panel de reporte abierto | Recién abierto, sin cargar |
| 3 | Estado general | Severidad "Alta" seleccionada |
| 4 | Observaciones | Texto de ejemplo cargado |
| 5 | Contexto del partido | Desplegable Señal abierto |
| 6 | Prueba Envío señal | Hora + toggles mixtos SI/NO |
| 7 | Problemas detectados | 2–3 chips marcados |
| 8 | Bloque técnico | Fotos subidas + valores cargados |
| 9 | Selector Tomar foto / Galería | Modal abierto |
| 10 | Pie con Guardar/Editar/Enviar | Con mensaje de estado visible |
| 11 | Estado "Reportado" | Después de enviar |

Usar datos de prueba (equipos demo), nunca datos reales de contactos.
