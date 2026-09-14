# Guía de diseño — Conquista de Cajas

Dirección visual aprobada tras varias iteraciones: **estilo juego móvil
amigable / "candy"**, tipo Two Dots o Toon Blast — no glassmorphism
abstracto ni sci-fi. Piezas redondeadas, colores saturados tipo caramelo,
profundidad suave (no plano, pero tampoco fotorrealista).

## Fondos

- `frontend/assets/bg-menu-dark.jpg` — versión oscura.
- `frontend/assets/bg-menu-light.jpg` — versión clara.
- Ambas generadas con Canva ("candy cubes" style). Cualquier fondo nuevo
  debe mantener este lenguaje visual y generarse para **ambos** temas, no
  solo uno.
- Referenciados desde `--bg-photo` en `style.css`. Recuerda subir el
  `?v=N` al reemplazar el archivo (ver [CLAUDE.md](CLAUDE.md)).

## Tipografía

Google Fonts, cargadas en `index.html`:

- **Manrope** (700/800) — `--font-display`, para títulos y marcador.
- **Inter** (400–800) — texto general.
- **JetBrains Mono** (600/700) — códigos de sala / valores monoespaciados.

## Paleta — tema oscuro (`:root`)

| Uso | Variable | Valor |
|---|---|---|
| Fondo base | `--bg` | `#0a120f` |
| Tarjeta | `--card` | `#101c16` |
| Borde tarjeta | `--card-border` | `#24392f` |
| Texto | `--text` | `#e6f1ea` |
| Texto secundario | `--muted` | `#8ca79a` |
| Acento (yo/jugador) | `--accent` | `#34d399` (verde menta) |
| Acento fuerte | `--accent-strong` | `#6ee7b7` |
| Rival | `--rival` | `#38bdf8` (azul cielo) |
| Éxito | `--success` | `#22c55e` |
| Peligro | `--danger` | `#f87171` |
| Aviso | `--warning` | `#fbbf24` |

## Paleta — tema claro (`[data-theme="light"]`)

| Uso | Variable | Valor |
|---|---|---|
| Fondo base | `--bg` | `#f2faf6` |
| Tarjeta | `--card` | `#ffffff` |
| Texto | `--text` | `#0f1f17` |
| Acento (yo/jugador) | `--accent` | `#059669` |
| Rival | `--rival` | `#0284c7` |
| Éxito | `--success` | `#16a34a` |
| Peligro | `--danger` | `#dc2626` |

En ambos temas, **verde = jugador propio, azul = rival** — no cambiar esta
asociación de color en ningún elemento nuevo (marcador, cajas del tablero,
avatares, etc.).

## Colores de acento por sección (chips)

- Amigos: `--chip-friends` (`#f59e0b` oscuro / `#d97706` claro, ámbar)
- Perfil: `--chip-profile` (`#a78bfa` oscuro / `#7c3aed` claro, violeta)
- Ajustes: `--chip-settings` (gris azulado)

## Radios y sombras

- Radios: `--radius-lg: 22px`, `--radius-md: 16px`, `--radius-sm: 11px` —
  todo muy redondeado, coherente con el tono "candy".
- Sombras: `--shadow-sm/md/lg`, más marcadas en tema oscuro que en claro.

## Poderes (Modo Caos)

Iconografía fija, no cambiar sin pedirlo el usuario:

- 💣 Bomba
- ⭐ Multiplicador
- 🧊 Hielo

## Extensión del lenguaje "candy" a toda la app

Confirmado: el lenguaje visual "candy" ya no vive solo en los fondos del
menú, se extiende a toda la interfaz —

- **Pantallas secundarias** (perfil, ajustes, amigos, código de sala,
  lobby, selector de modo, partida, fin de partida): mismo lenguaje de
  tarjetas redondeadas, botones en pastilla con degradado y sombra, chips
  con anillo de color, que ya usaban home/inventario/ranking/tienda.
  Se mantienen como tarjeta opaca (no glass/blur) sobre el fondo con foto,
  a diferencia del menú principal: mejor legibilidad y rendimiento durante
  la partida.
- **Botón "← Volver"**: en vez de enlace subrayado, ahora es un botón
  redondo flotante (`.back-btn`) en la esquina superior izquierda de la
  tarjeta, mismo lenguaje que los `shell-round-btn` del menú. Los botones
  "Cancelar" / "Volver al inicio" pasaron de enlace subrayado a pastilla
  fantasma (`.link-btn` sin subrayado, con fondo sutil al hover).
- **Tablero de juego**: bandeja con degradado sutil y sombra interior
  detrás de la cuadrícula (`.board-wrap`), líneas más gruesas con extremo
  redondeado tipo "palito de caramelo", puntos más grandes con sombra,
  cajas con esquinas más redondeadas y borde de color al reclamarlas,
  animación de aparición con rebote (`cubic-bezier` con overshoot) en vez
  de un simple fade.

## Corrección: color de "yo" en el tablero fijo, no reskinable

Bug de diseño detectado y corregido: los temas de color de la Tienda
(Océano, Atardecer, Lavanda...) sobreescriben `--accent`/`--accent-strong`,
que antes también pintaban las líneas/caja "mías" y el chip de marcador
propio en el tablero. Con el tema Océano (azul) equipado, tus propias
líneas podían confundirse visualmente con las del rival (también azules).
Ahora el tablero y los chips de marcador usan `--mine`/`--mine-strong`,
variables fijas que **no** cambian con la Tienda — verde para "yo" y azul
para el rival siempre, sin importar el tema equipado. Los temas de la
Tienda siguen recoloreando el resto de la interfaz (botones, títulos,
barra de progreso del turno, etc.) con total libertad.
