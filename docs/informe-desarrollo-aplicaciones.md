# Informe de desarrollo — Ecosistema de aplicaciones BasquetPass

**Fecha del informe:** 7 de septiembre de 2026
**Alcance:** estado actual, funcionalidades principales y plan de evolución de las aplicaciones internas desarrolladas para BasquetPass.

---

## 1. Resumen ejecutivo

BasquetPass opera hoy sobre un ecosistema de cinco aplicaciones internas bajo el dominio `basket-app.com`, desplegadas en un servidor propio (VPS) y pensadas para cubrir el ciclo completo de una transmisión: planificar y dotar de personal cada partido, registrar cómo salió la emisión, generar las piezas gráficas de promoción y medir el negocio (suscriptores, pagos, partidos emitidos, ingresos).

| # | Aplicación | URL | Estado |
|---|---|---|---|
| 1 | **basketApp — Portal Operativo** | portal.basket-app.com | En producción |
| 2 | **Analíticas** | analytics.basket-app.com | Suscripciones y Partidos en producción · Financiero en desarrollo |
| 3 | **Generador de Imágenes** | generator.basket-app.com | En uso, en desarrollo |
| 4 | **BasquetPass Operations Hub** | *(a completar)* | *(a completar)* |
| 5 | **Incidencias** | incidencias.basket-app.com | En producción |

Hitos destacados del período:

- **Identidad única (SSO)**: el Portal, Analíticas y el Generador comparten un único inicio de sesión (Google Workspace o enlace mágico por correo). Un usuario entra una vez y es reconocido en todas las apps; cada app decide por separado qué puede hacer.
- **Independencia de proveedores externos**: las bases de datos del Portal se migraron a Postgres propio en el VPS. El proveedor Supabase quedó retirado por completo el 4 de septiembre de 2026.
- **Autoregistro con aprobación**: los colaboradores externos se registran solos y un productor o administrador aprueba el acceso desde el Portal.
- **Convocatorias automáticas**: el Portal envía por WhatsApp y correo la convocatoria del día de partido a cada persona asignada, sin intervención manual.
- **Módulo Financiero de Analíticas** con datos vivos de Stripe y MercadoPago, conversión a dólares día por día y alertas por correo si una fuente deja de sincronizar.

`[SCREENSHOT: mapa del ecosistema / launcher de aplicaciones del apex basket-app.com]`

---

## 2. basketApp — Portal Operativo (portal.basket-app.com)

**Estado: En producción.**

### 2.1 Qué resuelve

Es la consola operativa central de producción. Reemplaza la planilla de "Grilla Producción" como fuente de trabajo diaria: concentra la agenda de partidos a transmitir, el staff asignado a cada uno, los contactos, los equipos y clubes, las convocatorias y el parte técnico que cada colaborador completa al terminar la transmisión.

Tecnología: Next.js 16 (React 19), Postgres propio, Better Auth. Interfaz en español, con versión de escritorio para coordinación y versión móvil para colaboradores.

`[SCREENSHOT: vista Grilla (día) con tarjetas de partido]`

### 2.2 Funcionalidades principales

**Grilla de producción (`/grid`)**
- Agenda de partidos en vista **Día** y **Mes**, con navegación por fecha, orden y acceso a días anteriores.
- Dos modos de visualización: **Tarjetas** (orden de trabajo con escudos, hora, liga, modo de producción, ID de producción y bloques de asignaciones) y **Tabla**. La preferencia se recuerda por usuario.
- Buscador y filtros por liga, modo de producción, estado y responsable.
- **Edición rápida** desde la tarjeta: cambiar local, visitante, liga, modo y estado sin abrir el detalle.
- Alta y edición de partidos en modal: fecha, hora, duración, zona horaria, liga, equipos (con autocompletado del catálogo de clubes), sede, modo de producción, plan de relatos, estado, responsable, observaciones e ID de producción.
- Panel lateral de **insights**: total de partidos, comparación hoy vs mes, personas más asignadas y carga por responsable.
- Modal de **Estadísticas** por rango de fechas con filtros por liga, equipos, producción y funciones; pestañas Personas, Equipos, Producción y Funciones; detalle por persona; exportación a **CSV y PDF**.
- Exportación de la jornada a PDF y CSV ("Control de producción").
- Modal de **contactos del partido**: teléfonos y correos del staff asignado, con copiar y abrir WhatsApp.
- **Sincronización con Google Sheets**: la grilla histórica se sigue leyendo desde la planilla. Un botón muestra el plan de cambios (partidos a crear, actualizar o eliminar, personas a crear o reactivar, advertencias) antes de aplicarlo. Además corre automáticamente cada 30 minutos.

`[SCREENSHOT: modal Estadísticas con pestañas y exportación]`

**Detalle de partido (`/match/[id]`)**
- Cabecera con escudos, liga, fecha y hora, sede, modo de producción, estado y responsable de cancha.
- **Asignaciones por función** en tres bloques: principales (responsable, realizador, control, gráfica, soporte, productor), cámaras (1 a 5) y transmisión (encoder, ingeniería).
- **Detección de conflictos**: avisa si una persona ya está asignada a otro partido que se superpone en horario.
- **Confirmación de asistencia** por parte del propio asignado, disponible hasta que termina el partido.
- Número de encoder por asignación.
- Integraciones: enlace a **Google Calendar**, mensaje de convocatoria listo para copiar, lista de WhatsApp y enlaces directos por persona.
- Botón **Enviar notificación a todos**: envío inmediato de WhatsApp y correo a todo el staff asignado.
- **Historial de auditoría** del partido (quién cambió qué y cuándo).
- Panel con los **partes técnicos** cargados por los colaboradores para ese partido.

`[SCREENSHOT: detalle de partido con asignaciones y conflictos]`

**Convocatorias (`/match/[id]/notificar`)**
- Lista de destinatarios con sus funciones, mensaje personalizado por persona, envío individual por WhatsApp o correo, envío masivo por correo y aviso de funciones sin cubrir.

**Convocatorias automáticas del día de partido**
- Un planificador interno envía la convocatoria a cada asignado sin intervención manual. Para partidos desde las 12:00 se envía ese mismo día a las 11:00; para partidos matutinos, la noche anterior a las 22:00.
- Cada envío queda registrado por destinatario con su resultado. Existe un interruptor global de apagado y el envío manual como vía de recuperación.

**Mi jornada — vista móvil para colaboradores (`/mi-jornada`)**
- Saludo personalizado, tarjetas de resumen (partidos asignados, asistencias sin confirmar).
- Próximas asignaciones y las del último mes, con escudos, fecha, hora, sede, responsable de cancha, función propia y nota.
- Acceso rápido a WhatsApp y al botón **Reportar**.
- Navegación inferior fija pensada para teléfono, con campana de comunicados.

`[SCREENSHOT: Mi jornada en teléfono]`

**Parte técnico del colaborador (`/mi-jornada/[matchId]/reportar`)**
- Contexto del partido en cabecera (liga, modo, equipos, función, fecha, sede, responsable).
- Formulario: observaciones, nivel de incidencia (sin / baja / alta / crítica), feed detectado, checklist de problemas (internet, imagen, OCR, overlays, gráfica, club, responsable de cancha), señal (BP, BP/FDC, FDC/DTV, FDC/TYC, Telemundo…), apto lineal, hora y resultado de la prueba de salida, número de encoder.
- Guardado de borrador y envío. El parte queda visible en el detalle del partido para coordinación.

`[SCREENSHOT: formulario de parte técnico en móvil]`

**Personal (`/people`)**
- Directorio del staff con tabla en escritorio y tarjetas en móvil, buscador y filtros instantáneos.
- Ficha con nombre, correo, teléfono, **funciones** (múltiples), **clubes/equipos** vinculados, notas y estado activo/inactivo. Estado y cantidad de asignaciones vigentes derivados de la grilla real.
- Bloque **Acceso a la plataforma** por persona: habilitado/desactivado, cambio de nivel de acceso, revocación (conserva ficha e historial) y eliminación con resguardos.

**Equipos y clubes (`/teams`)**
- Directorio de equipos por club y categoría (mayores, próximo, femenino) con escudo, liga, sede, responsable de cancha y enlaces oficiales.
- Pestañas por liga y buscador instantáneos.
- **Arrastrar y soltar** para mover equipos entre ligas, alta de equipo o club, borrado.
- Datos de club: manager, sitio oficial, redes, contacto de transmisión, cuenta BasquetPass, alias y sedes.

`[SCREENSHOT: directorio de equipos por liga]`

**Reportes (`/reports`) e Incidencias (`/incidents`)**
- Consolas ejecutivas con indicadores, tablas ordenables, gravedad, panel de analítica y exportación a PDF. Hoy funcionan sobre datos de demostración; conectarlas a datos reales es la primera fase del roadmap de producto (ver 2.5).

**Fixtures (`/fixtures`)**
- Listado de partidos oficiales sincronizados desde fuente externa (competencia, categoría, fase, equipos, resultado, fecha, sede, ciudad) con filtro por categoría.

**Catálogo de funciones (`/roles`, solo administradores)**
- Gestión de las funciones de producción (Responsable, Realizador, Operador de Control, Operador de Gráfica, Soporte técnico, Productor, Relator, Comentarista, Campo, Encoder, Ingeniería, Cámaras 1–5) agrupadas por categoría.

**Registros (`/notifications`, solo administradores)**
- **Convocatorias**: todos los envíos WhatsApp y correo, automáticos y manuales, con resultado por destinatario.
- **Sincronizaciones de grilla**: cada corrida con partidos creados, actualizados y eliminados.
- **Solicitudes de acceso**: pendientes, historial de decisiones y cuentas por vincular.

**Configuración (`/settings`)**
- Perfil y avatar; densidad de interfaz.
- Clave y modelo de **Gemini** (asistente de IA), con prioridad personal, del portal o del servidor.
- **Comunicado general** (solo admin): mensaje que aparece tras el inicio de sesión y queda en la campana.
- **Destinatarios de avisos** de solicitudes de acceso por función.

**Aplicación instalable (PWA)**
- Instalable en Android e iOS con banner de "Agregá a tu inicio". Se decidió no usar caché offline para garantizar datos siempre actualizados.

### 2.3 Accesos y roles

| Rol | Alcance |
|---|---|
| **Admin** | Todo: configuración, registros, catálogo de funciones, niveles de acceso, revocaciones. |
| **Productor** | Grilla, personal, equipos, reportes, aprobación de solicitudes. Solo puede otorgar nivel Externo. |
| **Externo** | Solo Mi jornada y su parte técnico. |

- La autorización se resuelve en la aplicación con una tabla única de capacidades. Toda mutación queda sellada con el actor y registrada en el historial de auditoría, verificado por pruebas automáticas.

### 2.4 Autenticación e identidad compartida

- Inicio de sesión con **Google** (restringido al dominio corporativo) o **enlace mágico por correo** para colaboradores externos. No hay contraseñas.
- Sesión de 60 días con renovación automática; los cambios de permisos son inmediatos.
- **SSO entre subdominios**: la misma sesión sirve para Portal, Analíticas y Generador.
- **Autoregistro**: quien entra sin acceso completa una solicitud (nombre, teléfono, función, país, ciudad, mensaje). Los productores y administradores reciben el aviso en el Portal, y al aprobar eligen función y nivel de acceso, pudiendo crear la ficha, reactivar una existente o fusionar duplicados. La aprobación envía la invitación por correo; toda decisión queda auditada.

`[SCREENSHOT: pantalla de login y formulario de solicitud de acceso]`

### 2.5 Integraciones

| Integración | Uso |
|---|---|
| WhatsApp (OpenWA, instancia propia) | Convocatorias automáticas y manuales. |
| WhatsApp enlaces directos | Contacto rápido desde grilla, detalle y Mi jornada. |
| Correo (Google Workspace) | Enlace mágico, invitaciones, convocatorias, avisos de solicitudes. |
| Google Calendar | Enlace de evento por partido. |
| Google Sheets | Sincronización de la grilla de producción (manual y cada 30 min). |
| Gemini (Google) | Asistente sobre personal y lectura de capturas de speedtest. |
| Ingesta externa de partidos | API protegida por clave para cargar partidos desde sistemas externos. |
| Gate del Generador | El Portal decide quién puede entrar al Generador de Imágenes. |

### 2.6 Infraestructura

- VPS propio con proceso Node persistente administrado por pm2 y nginx delante.
- Base de dominio: Postgres 17 en contenedor propio. Base de identidad: Postgres 17 separado, compartido por todas las apps.
- Backups nocturnos con prueba de restauración semanal.
- Despliegue automático al integrar cambios en la rama principal.
- Control de calidad: lint, tipos, pruebas unitarias e integración contra Postgres efímero en CI.

### 2.7 Evolución reciente

| Período | Hito |
|---|---|
| Mar 2026 | Primera versión: grilla, detalle de partido, personal, funciones. |
| Abr–Jun 2026 | Rediseño completo, catálogo de clubes, Equipos, Incidencias, Reportes, Configuración, primera versión móvil Mi jornada. |
| Jun 2026 | Identidad unificada: base de auth propia, autorización en la app, Google + enlace mágico. Convocatorias automáticas de día de partido. |
| Jul 2026 | Migración de la base de datos a Postgres propio. |
| Jul–Ago 2026 | Campaña de rendimiento: todas las pantallas por debajo de 200 ms percibidos; grilla mensual 8,7 MB → 2,5 MB. |
| Ago 2026 | Funciones múltiples por persona, auditoría móvil, autoregistro con aprobación. |
| Sep 2026 | Parte técnico rediseñado y visible en el partido, Equipos con arrastrar y soltar, país y ciudad en solicitudes, catálogo único de roles, retiro definitivo de Supabase. |

### 2.8 Próximos pasos

**Inmediato**
- Cerrar el SSO real entre subdominios (Analíticas ya lo usa; queda unificar configuración de orígenes de confianza y validar cierre de sesión propagado).
- Aplicar en producción la migración del catálogo único de roles.

**Roadmap de producto** (el partido como entidad madre: 1 partido → 1 reporte, N incidencias)
1. **Persistencia real de Incidencias y Reportes** en base de datos, reemplazando los datos de demostración.
2. **Adjuntos y evidencia técnica** (capturas de speedtest, ping, GPU, imágenes) con lectura asistida por IA.
3. **Integración total con la grilla**: crear y ver incidencias y reportes desde la tarjeta o el detalle del partido, con indicadores de incidencia crítica y reporte pendiente/completado.
4. **Registro de actividad** real para partidos, incidencias, reportes, equipos y personas.
5. **Equipos 100% en base de datos** con responsable vinculado a personal e incidencias por club.
6. **IA con datos reales**: consultas del tipo "qué partidos no tienen reporte final" o "qué club acumula más incidencias", con citas de los registros usados.

**Backlog técnico**
- Rendimiento de Reportes e Incidencias (pantallas más pesadas pendientes).
- Reducir datos personales serializados en la grilla (cargar teléfonos bajo demanda).
- Ajustes móviles confirmados (modales que no caben en 844 px, scroll horizontal en Reportes).
- Manual técnico "Reportar incidencias" para colaboradores (complemento del manual de usuarios).
- Incorporar la app Incidencias al inicio de sesión compartido.

---

## 3. Analíticas (analytics.basket-app.com)

**Estado: Suscripciones y Partidos en producción. Financiero en desarrollo.**

### 3.1 Qué resuelve

Plataforma de analítica del negocio de streaming. No es dueña de ningún dato: **espeja** la plataforma BasquetPass y el panel de control (Sintra), las planillas operativas y las pasarelas de pago, y reporta sobre ese espejo. Reemplaza un tablero HTML estático de 6 MB con datos precalculados.

Público: producto y negocio (métricas), operaciones (salud de datos), contenido (partidos emitidos vs producidos), finanzas (bruto, neto, comisiones).

Tecnología: Next.js 16, Postgres 16 propio, Chart.js, Better Auth (SSO con el Portal). Interfaz íntegramente en español, con explicación "?" en cada indicador y gráfico.

`[SCREENSHOT: landing de Analíticas con las tarjetas de dashboards]`

### 3.2 Sincronización de datos

| Fuente | Modo | Frecuencia |
|---|---|---|
| API de la plataforma (usuarios, equipos, torneos, contenido) | Automático | Cada 6 horas |
| **Pagos (export `pagos.csv` desde Sintra)** | **Manual: carga del archivo desde la app** | Cuando el analista lo sube |
| Google Sheets (partidos, incidencias, grilla, fixtures de 9 ligas) | Automático | Cada 6 horas |
| Stripe (comisiones, suscripciones, clientes, disputas, liquidaciones) | Automático | Cada 6 horas |
| MercadoPago (comisiones, suscripciones vía API; reportes por SFTP) | Automático | Cada 6 horas |
| Tipos de cambio (dólar blue, EUR/USD) | Automático | Cada 6 horas |

**Sobre la carga manual de pagos:** el endpoint de exportación de pagos del panel Sintra no está habilitado para nosotros (responde vacío y su reemplazo requiere una sesión de navegador imposible de replicar desde un servidor). Por eso los pagos entran mediante la carga del export `pagos.csv`. El flujo protege los datos: la app valida el archivo, muestra una **vista previa** (filas, ventana de fechas, conteo por pasarela, advertencias como "parece el export de suscripciones" o "puntos de precio sin tarifa") y solo escribe al confirmar. Cada carga queda registrada con quién, qué archivo y qué ventana. Nunca borra datos; recargar un archivo corregido sobre la misma ventana lo repara.

Adicionalmente existe una **alerta por correo** independiente de la app que avisa cuando una fuente lleva más de 48 horas sin sincronizar correctamente (creada tras detectar 221 fallos consecutivos silenciosos en agosto).

`[SCREENSHOT: modal de carga de pagos.csv con vista previa]`

### 3.3 Módulo Suscripciones (`/basket`) — En producción

Filtros globales: rango (ayer, 7, 30, 90 días, año en curso, todo, personalizado), granularidad (día/semana/mes), países, tipo de acceso (real / voucher / Antel), subtipo de plan (Free, Mensual Básico, Mensual Total, Anual Total). La fecha de corte por defecto es "ayer" para no mostrar días parciales.

Seis pestañas:

1. **Visión general**: activos totales, pagos reales, vouchers, Antel, activos por plan, nuevos pagadores; tendencia 30 días, mix de acceso, distribución por país, mix por plan, ingresos por moneda; embudo de base de usuarios y movimiento de suscripciones.
2. **Evolución histórica**: activos al final, pico, variación absoluta y %; áreas apiladas por tipo de acceso y por plan.
3. **Análisis por equipo**: equipos con pagadores, pagadores únicos, pagos, top equipo; tabla ordenable (equipo, liga, país, pagadores, pagos, monto) y detalle por equipo con movimiento diario de suscripciones.
4. **Análisis financiero**: pagos en rango, moneda principal, plataformas; ingresos diarios por moneda, tabla por plataforma, apilado mensual.
5. **Retención / churn**: churn y retención del último mes y promedio; ciclo de vida mensual (nuevos, renovaciones, reactivaciones, expiraciones), curvas de churn y retención, tabla mensual.
6. **Calidad de datos**: conteos, incidencias deterministas (pagos huérfanos, usuarios sin país, equipos desconocidos) y **log de sincronizaciones** (cargas manuales, ingestas automáticas, corridas del cron, con duración y resultado).

`[SCREENSHOT: Suscripciones — Visión general]`
`[SCREENSHOT: Suscripciones — Retención]`

### 3.4 Módulo Partidos (`/partidos`) — En producción

Fuente: planillas "Ligas Argentinas" y "Ligas Internacionales".

- **Nacional**: filtros por temporada, liga (LNB, Liga Argentina, Liga de Desarrollo, Liga Femenina, Liga Federal, Liga Metropolitana), control y meses. Indicadores: total temporada, último mes y última semana con variación, promedio semanal. Gráficos mensual y semanal por canal (Total, TyC, DirecTV, BP) y desglose por liga.
- **Internacional**: 22 ligas de 9 países (Uruguay, Brasil, Chile, Bolivia, Ecuador, Italia, España, FIBA). Indicadores: total temporada, último mes, total Argentina, total exterior, BP emitido, BP producido, externo producido. Gráficos mensual, semanal y por país.

`[SCREENSHOT: Partidos — vista Nacional]`

### 3.5 Módulo Financiero (`/financiero`) — En desarrollo (desplegado con datos reales)

Lleva a datos vivos el prototipo financiero validado. Regla central: nunca mezclar el plano de **cobro** (lo que pagó el suscriptor, en su moneda) con el de **liquidación** (lo que movió la pasarela). Las comisiones y las retenciones impositivas se tratan por separado.

**Vista Financiero**
- Indicadores: transacciones, suscripciones activas y cerradas por pasarela, bruto por moneda, neto por moneda de liquidación, neto en USD del último mes, retenciones.
- Gráficos: consolidado (ingresos + activos + transacciones), mix de planes, altas y cancelaciones por mes, ingresos netos por mes y en USD convertidos día por día, comparativa por temporadas, comisiones de pasarela, neto diario, detalle mensual por moneda, ingresos por país, suscripciones por estado, catálogo de precios inferido por plan y mercado.
- Los bloques aún no disponibles se muestran explícitamente como "pendiente" o "en desarrollo" con su razón.

**Vista Contenido**
- Contenidos publicados, vistas, usuarios únicos, tiempo total y promedios; cortes mensual, por país del contenido, torneo, liga, equipo, top de vistas y top de días-evento.

`[SCREENSHOT: Financiero — vista consolidada]`
`[SCREENSHOT: Financiero — vista Contenido]`

### 3.6 Accesos e infraestructura

- Sin pantalla de login propia: quien no tiene sesión es enviado al login del Portal y vuelve al destino original. Roles admin / viewer; lista de correos autorizados propia de Analíticas.
- Pantalla `/admin` para alta, baja y rol de usuarios.
- Postgres 16 en contenedor propio, ajustado para el VPS; 6 vistas materializadas para respuestas por debajo de 200 ms.
- Pruebas unitarias (Vitest) y baterías de verificación (smokes) por área.

### 3.7 Evolución reciente

| Período | Hito |
|---|---|
| May 2026 | Fundación: filtros globales, seis pestañas de Suscripciones. |
| Jun–Jul 2026 | Autenticación, roles, base productiva, backups; módulo Partidos. |
| Ago 2026 | Pagos por carga de archivo, SSO con el Portal, rangos y filtros nuevos, optimización de consultas. |
| Fin Ago 2026 | Financiero con datos vivos: tipos de cambio, espejos de Stripe y MercadoPago, inbox SFTP, alertas por correo. |
| Sep 2026 | Log de sincronizaciones, explicaciones en cada indicador, suscripciones de MercadoPago desde la API, refactor del motor de sync en pasos declarativos. |

### 3.8 Próximos pasos

**Financiero (en curso)**
- Completar bloques pendientes: altas/bajas/netas de los últimos 15 días, activos por antigüedad, vida promedio del suscriptor, suscriptores activos reales.
- **Real vs Plan**: el dato existe; falta la hoja de objetivos del negocio.
- Devoluciones y contracargos de MercadoPago; histórico de comisiones de MP (26 meses restantes).

**Dependencias externas**
- Habilitar el endpoint de pagos de Sintra o, como reemplazo previsto, leer los pagos directamente de MercadoPago y Stripe (Manual, Voucher, PayPal y Antel seguirían por export).
- PayPal sin fuente de comisiones: se declara solo bruto.

**Diferido**
- Eventos de reproducción (alto volumen), bandas de fase de temporada en Evolución, pestaña de Engagement, filtro por liga, módulo Contactos (esquema listo, sin pantalla).

**Operación**
- Gestor de secretos y rotación de tokens, CI/CD con migraciones y smoke automático, observabilidad (logs estructurados, métricas por paso de sync), endurecimiento de seguridad, runbook operativo, inventario de datos personales y política de retención.

---

## 4. Generador de Imágenes (generator.basket-app.com)

**Estado: En uso, en desarrollo.**

### 4.1 Qué resuelve

Herramienta web para producir las **piezas gráficas de portada** de las transmisiones de BasquetPass.TV sin depender de un diseñador ni de software de edición. Genera simultáneamente el banner horizontal (2304 × 720 px) y el cuadrado para móvil (800 × 800 px), y los descarga como PNG con el nombre de archivo ya armado con la fecha.

Tecnología: aplicación de un solo archivo (HTML + CSS + JavaScript) que renderiza en el navegador; servidor estático Node sin dependencias; biblioteca de recursos autogenerada. El acceso lo controla el Portal (mismo inicio de sesión).

`[SCREENSHOT: pantalla principal del Generador con canvas desktop y mobile]`

### 4.2 Funcionalidades principales

**Composición**
- Partido principal (liga, equipo local y visitante con escudos en tarjetas con borde neón) y hasta **2 partidos secundarios** bajo el título "También disfrutá en vivo".
- Hasta **4 fotos de jugadores** de media day (2 por equipo).
- Logo de liga en versión **fase regular** o **playoffs**.
- Texto superior libre (ej. "FINAL JUEGO 5") y bloque de texto automático (equipos + VS) o personalizado multilínea (horario, instancia), con ajuste automático de tamaño.
- Tipografía corporativa Loos y carga de fuentes propias.

**Fondos y estilo**
- 4 paletas predefinidas, paleta personalizada de 3 colores y botón aleatorio.
- Galería de 57 fondos generados con IA, subida de fondo propio o fondo transparente.
- 6 tipos de degradado, capas automáticas de luz y partículas, 6 modos de luz entre escudos.
- **Colores de marca por liga** precargados para 24 ligas.
- Cuentagotas para tomar colores de pantalla.

**Efectos sobre fotos**: 24 efectos acumulables (aura, sombra, neón, recorte revista, duotono, glitch, bokeh, niebla, etc.) con intensidad y colores configurables.

**Edición directa en el canvas**
- Seleccionar, arrastrar y escalar jugadores, logos y escudos con manijas, con posiciones independientes para desktop y móvil.
- **Memoria de pose por foto**: la posición elegida para cada jugador se recuerda y se reaplica la próxima vez.

**Carga rápida por fixture**
- Se pega el fixture del día (un partido por línea, "Racing - Regatas", "Peñarol vs San Lorenzo") y la app reconoce equipos y liga con búsqueda tolerante a acentos y variantes, y arma los tres partidos con sus escudos. Informa línea por línea lo que encontró.

`[SCREENSHOT: Carga rápida por fixture]`

**Persistencia**
- Autoguardado del trabajo en curso y restauración al reabrir.
- Fotos propias por equipo, con exportación e importación entre computadoras.

### 4.3 Cobertura de datos

| Liga | Equipos | Fotos de jugadores |
|---|---|---|
| Liga Nacional (Argentina) | 19 | 4.034 |
| Liga Argentina | 34 | 475 |
| Liga Femenina | 18 | 286 |
| LUB (Uruguay) | 12 | 185 |
| LNB Chile, Liga Federal, Liga Dos, Euroliga, Liga Endesa, Primera FEB, LBA Italia, LDA, LIBO, LBP Femenina | 230 | solo escudos |
| **Total** | **313** | **4.980** |

Herramientas de datos: regenerador de la biblioteca a partir de las carpetas de media day y escudos, actualizador de fotos de Liga Nacional y validador que contrasta las fotos disponibles con los planteles oficiales publicados por la Liga Nacional (informa jugadores sin foto y fotos sin plantel).

### 4.4 Flujo de uso

1. Pegar el fixture y cargar todo.
2. Elegir plantilla, fondo y paleta.
3. Seleccionar fotos de jugadores.
4. Ajustar composición en desktop y en móvil.
5. Aplicar efectos y logo de playoffs si corresponde.
6. Escribir textos.
7. Descargar ambos PNG.

### 4.5 Evolución reciente

- Pasó de 9 a 16 ligas (suma cobertura europea) y de 20 a 24 efectos.
- Se agregaron carga rápida por fixture, memoria de poses, logo de playoffs, exportación/importación de fotos propias, luz entre escudos y limpieza automática de fondos negros en escudos.
- Acceso protegido por el inicio de sesión del Portal.

### 4.6 Próximos pasos

**Datos**
- Regenerar y depurar la biblioteca: completar fotos de LNB Chile, cargar equipos de LBP Masculina y LNF Chile, nombrar 268 fotos sin identificar y curar las tomas múltiples de Liga Nacional para agilizar la selección.

**Procesos**
- Unificar las dos rutas de actualización de la biblioteca y adaptar el validador de planteles al entorno actual y a más ligas.
- Automatizar la publicación de recursos al servidor (hoy manual).

**Producto**
- Nuevas plantillas: quintetos iniciales, previa, resultado final, story vertical 1080 × 1920, ficha de jugador.
- Partidos secundarios también en el formato móvil.
- Datos deportivos automáticos (fecha, hora, marcador) en lugar de texto manual.
- Biblioteca compartida de fotos propias y poses entre operadores (hoy vive en cada navegador).

---

## 5. BasquetPass Operations Hub

**Estado:** *(a completar)*

> Esta sección se completa con el material provisto por el equipo. Estructura sugerida:

### 5.1 Qué resuelve
*(descripción del propósito y usuarios)*

### 5.2 Funcionalidades principales
- *(módulo 1)*
- *(módulo 2)*
- *(módulo 3)*

`[SCREENSHOT: Operations Hub — pantalla principal]`

### 5.3 Integraciones y datos
*(fuentes, sincronizaciones, relación con las demás apps)*

### 5.4 Evolución reciente
*(hitos con fechas)*

### 5.5 Próximos pasos
*(planificado, en curso, backlog)*

---

## 6. Incidencias (incidencias.basket-app.com)

**Estado: En producción.**

### 6.1 Qué resuelve

Registro de cómo salió cada transmisión. Los **Operadores de Control** cargan una entrada por partido emitido, haya o no tenido problemas, con las mediciones previas, el detalle de fallas y una gravedad. Sobre esos datos se construyen reportes internos y un **informe semanal automático** que se envía a clientes externos (Tenfield en Uruguay, Canal CDO en Chile). Migró el histórico completo desde la planilla anterior en mayo de 2026.

Tecnología: Next.js 15, Supabase (base y autenticación propias), Claude para mejora de textos, correo vía Gmail. Despliegue automático al integrar cambios.

`[SCREENSHOT: listado de incidencias Argentina]`

### 6.2 Funcionalidades principales

**Organización**
- Dos regiones: **Argentina** (Liga Nacional, Argentina, Próximo, Federal, Femenina, Metropolitana, Amistosos, 3x3) e **Internacional** (unas 28 ligas: Euroliga, ACB, LDA Uruguay, Liga Chery y Liga Dos Chile, NBB, LIBO, entre otras).
- Listados paginados con búsqueda por equipo o ID y filtros por liga, gravedad y operador.

**Alta de partido**
- ID de partido, liga, fecha, hora, local, visitante, operador de control, streamer (autocompletado), gravedad, observaciones técnicas y edilicias, foto del speedtest.
- Botón **Mejorar con IA** que redacta las observaciones de forma clara y profesional.

**Detalle y cierre**
- Estado pendiente / completado.
- Mediciones: speedtest (Mbps y foto), ping, GPU, hora de prueba; checks de Prueba, Inicio y Gráfica.
- Problemas: internet, feed, OCR, overlays, ST, club, otro.
- Observaciones técnicas, edilicias y generales.
- Tipo de transmisión (Encoder, Encoder/Offtube, Normal, Offtube) y envíos de señal (BP, BP/IMG, BP/IMG/SPT, BP/FEED, IMG, SPT, FEED…).

`[SCREENSHOT: detalle de incidencia con mediciones y checklist]`

**Reportes (`/reportes`)**
- Filtros por región, liga y rango de fechas.
- Totales por gravedad y estado, por operador, por liga, por mes, por streamer y ranking de tipos de problema, con gráficos.
- Exportación a **CSV** y **PDF** (informe imprimible "Informe de incidencias de transmisión").
- Mejora masiva de observaciones con IA sobre el conjunto filtrado.

`[SCREENSHOT: Reportes con gráficos y exportación]`

**Informe semanal a clientes**
- Todos los sábados se envía por correo un resumen de los últimos 7 días por país: Uruguay (LDA) y Chile (Liga Chery y Liga Dos), con totales por gravedad, conteo de problemas y tabla de partidos con incidencias.

**Herramientas complementarias bajo el mismo dominio**
- Tableros estáticos de incidencias de feed y de total de partidos alimentados desde Google Sheets.
- Monitor del servidor de transmisión (CPU, memoria, disco, procesos, servicios, Nimble Streamer).

**Cuentas**
- Inicio de sesión con correo y contraseña, recuperación de contraseña y cambio desde el perfil. Roles admin y operador.

### 6.3 Evolución reciente

| Fecha | Hito |
|---|---|
| May–Jun 2026 | Migración del histórico desde la planilla; puesta en producción; despliegue automático. |
| Jul 2026 | Filtros completos sin límite de filas. |
| Ago 2026 | Filtro por liga en reportes; mejora de observaciones con IA individual y masiva; informe semanal por correo a Uruguay y Chile. |
| Sep 2026 | Recuperación de contraseña; exportación a PDF; actualización del listado de operadores. |

### 6.4 Próximos pasos

- **Incorporar al inicio de sesión compartido** del ecosistema (hoy usa cuentas propias), tal como está previsto en el plan del Portal.
- Diferenciar permisos entre administrador y operador (hoy todo usuario con acceso puede editar y borrar cualquier registro).
- Convertir en administrables las listas de ligas, operadores y streamers (hoy fijas en el código).
- Versionar el esquema de base de datos y sus políticas de acceso.
- Optimizar los reportes para volúmenes crecientes (hoy se calculan en el navegador sobre toda la tabla).
- Resguardo antes de la mejora masiva con IA (hoy sobreescribe el texto original sin deshacer).
- Evaluar la convergencia con el parte técnico del Portal, que hoy captura información equivalente por otra vía.

---

## 7. Visión de conjunto y prioridades

**Lo que ya funciona en producción**
- Portal completo para planificar, dotar y convocar partidos, con parte técnico móvil.
- Analíticas de suscripciones y de partidos emitidos.
- Generador de piezas gráficas en uso diario.
- Registro de incidencias con informe semanal a clientes.
- Identidad única entre Portal, Analíticas y Generador.

**Prioridades del próximo período**
1. **Portal**: Incidencias y Reportes con datos reales ligados al partido, adjuntos y actividad real.
2. **Analíticas**: cerrar el módulo Financiero (bloques pendientes y Real vs Plan) y resolver la fuente de pagos para eliminar la carga manual.
3. **Generador**: depurar la biblioteca de fotos y sumar plantillas (quintetos, resultados, stories).
4. **Incidencias**: sumarla al inicio de sesión compartido y evaluar su convergencia con el parte técnico del Portal.
5. **Transversal**: observabilidad, gestión de secretos y CI/CD homogéneos en todas las apps.

**Riesgos y dependencias**
- Dependencia del permiso de Sintra para el endpoint de pagos.
- Servidor compartido por todas las apps: cualquier operación fuera de alcance afecta a las demás.
- Listas y catálogos fijos en código en el Generador e Incidencias.

`[SCREENSHOT: cronograma / roadmap visual del ecosistema]`
