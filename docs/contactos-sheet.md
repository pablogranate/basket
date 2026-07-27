# Pestaña "Contactos Portal" — plantilla para cargar personas

La app lee **una sola pestaña** de la planilla de producción y con eso arma el listado de Personas del portal: crea, actualiza, restaura y **elimina** gente, y da o quita el acceso a la plataforma. La pestaña manda: lo que dice la pestaña es lo que queda en el portal.

- Planilla: la misma de la grilla de producción (id `18Zqlayhde5XpOehkXOa1FKtaBSXhDGDfvqMvstT5Rm8`). **No sirve otra planilla.**
- Pestaña: se tiene que llamar exactamente `Contactos Portal`.
- La planilla tiene que quedar compartida como "cualquier persona con el enlace puede ver".

La pestaña vieja `Contactos` (la lista de teléfonos por bloques) no se toca ni se borra: la app la ignora por completo. Las pestañas de la grilla (`Julio 2026`, etc.) tampoco se tocan.

## Cómo armarla

1. Creá la pestaña `Contactos Portal` (ya existe).
2. Fila 1, encabezados — como en `tools/sheets/contactos-template.csv`:

   | Liga | Nombre | Funcion | Club | Telefono | Correo |
   |---|---|---|---|---|---|

   Los nombres de las columnas son parte del contrato: escribilos así. Si una columna se llama distinto (`Nombre completo`, `E-mail`), la app la lee **vacía**, y vacío en `Funcion` o `Club` significa *borrar*. El orden de las columnas no importa.
3. Creá una pestaña `Listas` y pegá ahí `tools/sheets/contactos-listas.csv`: columna A `Funciones` (12 valores), columna B `Clubes` (166 clubes tal como están cargados en el portal).
4. Rangos con nombre, en la pestaña `Listas`:
   - `FuncionesValidas` → `Listas!$A$2:$A$13`
   - `ClubesValidos` → `Listas!$B$2:$B$167`
5. Validación de datos en `Contactos Portal`, en toda la columna desde la fila 2:
   - `Funcion` → lista desde el rango `=FuncionesValidas`, **rechazar la entrada**, mostrar desplegable.
   - `Club` → lista desde el rango `=ClubesValidos`, **rechazar la entrada**, mostrar desplegable.

   La validación rechaza, no avisa: un valor escrito a mano que el portal no conoce se descarta en silencio (queda solo como aviso en el log).
6. Cargá **todas** las personas y borrá las filas de ejemplo antes de la primera sincronización.

## Reglas por columna

| Columna | Regla |
|---|---|
| `Liga` | **No se sincroniza.** Es ayuda para producción: agrupar y filtrar dentro de la planilla. Poné lo que te sirva; la app la ignora. |
| `Nombre` | Obligatoria y única. Es la identidad de la persona. Fila sin nombre = fila ignorada, aunque tenga función, club y teléfono cargados. |
| `Funcion` | Una o varias, separadas por `,` o `;`. Solo los 12 valores de `FuncionesValidas`. Sin número de puesto: `Camara`, nunca `Camara 3`; `Comentario`, nunca `Comentario 2`. |
| `Club` | Uno o varios, separados por `,` o `;`. Solo valores de `ClubesValidos`. Vacío es válido (persona interna, sin club). |
| `Telefono` | Texto libre, como se usa hoy (`54 9 11 6791-9865`). |
| `Correo` | Es lo que le da acceso a la plataforma. Sin correo, la persona queda en el listado pero **no puede entrar** al portal. Poné casillas reales: la app crea el login sin pedir confirmación. |

Acentos y mayúsculas no importan: `Atenas de Cordoba` y `ATENAS DE CÓRDOBA` son el mismo club.

## Las tres cosas que muerden

1. **Cambiar un nombre no es renombrar: es borrar y crear de nuevo.** La persona vieja se elimina (y pierde su acceso) y aparece una nueva sin historial. Si es una corrección de tipeo, avisá a un admin antes.
2. **Vaciar la celda `Funcion` o `Club` borra todas las funciones o clubes de esa persona.** Cada sincronización reemplaza el conjunto completo por lo que dice la fila; no suma.
3. **Borrar una fila elimina a la persona del portal y le quita el login.** Si vuelve a aparecer más adelante con el mismo nombre, se restaura.

Freno de seguridad: si una corrida fuera a eliminar más de la mitad del listado (pestaña a medio cargar, mal nombrada, pegado incompleto), se cancela sin tocar nada y queda registrada como error. Por eso la primera sincronización necesita el listado **completo**, no una prueba con dos filas.

## Nombres repetidos

Dos filas con el mismo nombre no se pueden resolver: la app descarta **las dos**. Si hay dos personas homónimas, diferenciá el nombre en la pestaña (por ejemplo con el apellido completo o el club).

## Quién sincroniza

Cargar la pestaña no cambia nada por sí solo. Un **admin** o un **Productor** aprieta el botón de sincronizar (icono de refresco) en la cabecera de **Personas** (`/people`). El resultado — creados, actualizados, restaurados, eliminados y avisos — queda en **Registros → Sincronizaciones de contactos** (`/notifications/sync-people`).

Las personas nuevas con correo entran como **Externo**. Si alguien necesita más permisos, un admin le cambia el nivel desde Personas; la sincronización no lo vuelve a bajar.
