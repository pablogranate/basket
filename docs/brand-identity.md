# BasquetPass — Manual de Identidad (uso en el portal)

Referencia de marca para `portal.basket-app.com`. El portal es la herramienta **operativa**
de BasquetPass (grilla, gente, equipos, incidencias, producción en vivo). Debe sentirse como
una continuación natural de `www.basquetpass.tv` — mismo lenguaje visual, distinto propósito:
no dos productos diferentes, sino la versión "de trabajo" del mismo.

---

## 1. Logo

El logotipo tiene tres elementos:

- **Isotipo** — el símbolo (la "flecha/cancha"), sin texto.
- **Imagotipo** — símbolo + nombre combinados.
- **Logotipo** — la marca completa con tipografía.

### Versiones

| Versión | Descripción | Uso |
|---|---|---|
| **Principal** | símbolo + nombre (vertical) | presentación, splash, espacios amplios |
| **Horizontal** | símbolo a la izquierda + nombre | barras, headers, sidebar, firmas |
| **Reducida** | iniciales + símbolo | espacios chicos donde no entra el nombre completo |
| **Símbolo** | solo isotipo | favicon, avatar, loaders, espacios mínimos |

### Archivos disponibles

En `public/Logo Basquetpass SVG _ AI/`:

| Versión del manual | Archivo SVG |
|---|---|
| Símbolo / Isotipo | `Basket.tv  Isotipo_Rojo.svg` · `..._Negro.svg` · `..._Blanco.svg` |
| Principal (vertical) | `Basket.tv vertical rojo.svg` · `... negro.svg` · `... blanco.svg` |
| Horizontal | `Basket.tv horizontal rojo.svg` · `... negro.svg` · `... blanco.svg` |
| Reducida | **falta** — pedir a diseño |

> Nota: cada versión viene en rojo, negro y blanco. Usar **blanco** sobre fondos oscuros/rojos,
> **negro** sobre fondos claros cuando el rojo no contrasta, **rojo** como default sobre blanco.

### Área de respeto

Espacio libre obligatorio alrededor del logo. Ningún texto, imagen ni elemento gráfico
puede invadirlo. La medida de referencia es la **altura del isotipo**: dejar como mínimo
esa altura de margen en los cuatro lados. Aplica a todas las versiones y formatos.

### Tamaño mínimo

No reducir al punto donde el isotipo pierde legibilidad. Por debajo del tamaño mínimo de la
versión Horizontal o Principal, usar la versión **Símbolo**.

---

## 2. Paleta

Color principal y predominante: **rojo corporativo**. Blanco y negro son de apoyo
(fondos y aplicaciones complementarias).

| Color | HEX | RGB | CMYK |
|---|---|---|---|
| **Rojo BasquetPass** | `#E31B23` | 227, 27, 35 | 0, 100, 100, 0 |
| **Negro** | `#000000` | 0, 0, 0 | 0, 0, 0, 100 |
| **Blanco** | `#FFFFFF` | 255, 255, 255 | 0, 0, 0, 0 |

> El rojo es protagonista para elementos gráficos y de acento. Blanco/negro estructuran;
> el rojo señala. No introducir colores fuera de esta paleta para la identidad
> (los colores de estado del producto —éxito/alerta/error— son aparte y funcionales).

> **Discrepancia detectada:** los SVG de origen usan fills cercanos pero no idénticos
> (`#e3312d` en isotipo, `#df2320` en vertical/horizontal). El portal hoy usa `#e61238`
> como `--accent`. El manual manda: **`#E31B23`**. Unificar a ese valor.

---

## 3. Tipografía

### Principal — Poppins
https://fonts.google.com/specimen/Poppins

Familia completa: Thin, ExtraLight, Light, Regular, Medium, SemiBold, Bold, ExtraBold, Black
(todas con sus itálicas).

Uso: cuerpo, UI, navegación, datos, formularios. Es la voz por defecto del portal.

### Secundaria — Oswald
https://fonts.google.com/specimen/Oswald

Familia: ExtraLight, Light, Regular, Medium, SemiBold, Bold.

Condensada y vertical — para **títulos, encabezados de sección y números/etiquetas
destacadas**. Aporta el tono "broadcast/deportivo". No usar para texto largo.

### Jerarquía sugerida en el portal

- **Display / títulos de sección / scoreboard:** Oswald (Medium–Bold), uppercase con tracking.
- **Headings de UI:** Poppins SemiBold/Bold.
- **Cuerpo y datos:** Poppins Regular/Medium.
- **Mono / técnico (IDs, timestamps):** mantener mono actual solo si aporta; preferir Poppins.

---

## 4. Tono visual del portal

- **Continuidad con el sitio público:** mismo rojo, mismas tipografías, mismo isotipo.
  El usuario que viene de `basquetpass.tv` reconoce la marca al instante.
- **Pero operativo, no marketing:** densidad de información alta, jerarquía clara, menos
  espectáculo y más legibilidad. El rojo se usa con disciplina (acentos, estados activos,
  CTAs), no como fondo masivo.
- **Menos genérico / menos "plantilla":** la identidad (Poppins + Oswald + rojo + isotipo)
  es lo que diferencia el portal de cualquier dashboard estándar. Apoyarse en ella.
