# Rediseño de la experiencia de Compaki

## Objetivo

Explicar Compaki desde el valor que recibe una persona: encontrar productos de
vendedores independientes, vender con facilidad y ayudar a su comunidad. La
tecnología de pagos aparece como respaldo de confianza y en los detalles, sin
convertirse en un requisito para entender el producto.

Se mantiene el inglés de la aplicación original. No se cambian los contratos,
los endpoints ni las reglas de reparto de ingresos.

## Decisiones principales

- **Compradores:** portada centrada en descubrimiento, categorías que llevan al
  directorio, búsqueda sin distinción de acentos, resultados visibles, fichas de
  producto con mayor espacio visual y carrito con progreso de compra.
- **Vendedores:** acceso a la tienda desde su estudio, productos y ventas
  agrupados por tarea, saldo identificado como demostración y explicación clara
  de que los fondos de prueba no se pueden retirar.
- **Organizadores:** resumen del marketplace, navegación por secciones,
  desglose visual del ingreso, invitaciones y creación guiada con un ejemplo
  actualizado de cómo se reparte una venta de $100 antes del lanzamiento.
- **Miembros:** recompensas explicadas como un fondo compartido, una secuencia
  sencilla de contribución, cierre y cobro, y detalles de custodia accesibles
  mediante controles desplegables.

## Sistema visual

Verde bosque para las acciones principales; verdes suaves, marfil y tonos
terracota para superficies e ilustraciones. Tipografía Geist con jerarquía
editorial, tarjetas amplias, bordes suaves y una misma navegación y pie de
página. Las ilustraciones SVG son originales y están incluidas en el proyecto;
no dependen de imágenes remotas.

Las pantallas públicas, autenticación, incorporación de vendedores, creación de
marketplaces, compras, recibos, recompensas y paneles usan este sistema. Los
estados vacíos indican un siguiente paso. Hay pantallas de carga, recuperación
de errores y página no encontrada.

## Usabilidad y accesibilidad

- Navegación móvil desplegable, cierre por Escape y clic exterior.
- Enlace para saltar al contenido, foco visible y respeto por movimiento reducido.
- Etiquetas asociadas a los campos y autocompletado en acceso y envío.
- Envío de formularios con Enter, avisos de error y de estado accesibles.
- Diálogos nativos con control de foco, cierre con Escape y botón de cierre.
- Tablas con desplazamiento horizontal y carrito adaptado a pantallas estrechas.
- La creación espera que la dirección del marketplace esté confirmada como disponible.
- Aviso de testnet persistente y lenguaje explícito sobre los fondos de prueba.

## Validación

Se verificaron TypeScript, ESLint y la compilación de producción. Se revisaron en
el navegador la portada, el directorio y su búsqueda, la tienda, los controles
del carrito y la presentación a 390 px. Para las vistas privadas se utilizaron
datos locales temporales de revisión: panel de administración, estudio del
vendedor, formularios y asistente de creación. Esas vistas de revisión se retiran
del código final; no se crean cuentas, marketplaces ni pagos durante la revisión.
