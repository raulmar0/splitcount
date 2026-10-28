# Entre — diseño

App en español para repartir gastos entre amigos, inspirada en patrones de Splitwise consultados con Mobbin MCP. Se publicará un repositorio público y una aplicación en GitHub Pages, como pidió el usuario.

## Producto

- Grupos con nombre, emoji y miembros; un viaje de ejemplo claramente identificable al iniciar.
- Alta, edición y eliminación de gastos; pagador, fecha, categoría, participantes y reparto igual o por importes exactos.
- Balances por integrante y propuesta de transferencias para saldar deudas; registrar pagos sin procesar dinero.
- Búsqueda y filtros de gastos, resumen por categoría, exportación/importación JSON y exportación CSV.
- Persistencia local; sin cuentas ni sincronización en servidor. La interfaz debe explicar el guardado local.
- Interfaz adaptable, navegación por teclado, etiquetas accesibles, formularios con validación y confirmación de borrados.

## Dirección visual

Entre: editorial y cálida. Fondo marfil, texto verde casi negro, acento lima, tarjetas blancas, líneas finas. Barra lateral de grupos en escritorio y navegación compacta en móvil. Fotografía panorámica de Oaxaca, avatares por inicial, grandes cifras de saldo y lista de movimientos escaneable. Tipografía Manrope. No reutilizar capturas de Mobbin como interfaz.

## Decisiones técnicas

React + Vite estático con base relativa para GitHub Pages. Importes siempre en centavos enteros; reparto del residuo determinista. Estado persistido en localStorage, importación validada antes de reemplazar. Cada grupo tiene una moneda propia sin conversión automática.

Alternativas consideradas: HTML sin framework simplifica instalación pero complica formularios y estado; backend colaborativo necesita alojamiento adicional y cuentas. React estático cumple la publicación solicitada y mantiene la app editable y portable. Esta elección es del implementador.

## Referencias

- https://mobbin.com/screens/9f36de33-ee48-426a-b3df-65cba508f5b2 — cubierta de grupo, lista con categorías y acción para añadir.
- https://mobbin.com/screens/a65c5e3d-efa0-456e-8cf2-dc87f760e198 — balances individuales y pago de deuda.
- https://mobbin.com/screens/e7c36d66-c6c5-4422-a3ac-6c35db3fee8b — total de viaje y desglose de gastos.

## Validación

Pruebas de centavos, balances, liquidaciones y validación de importación. Build de producción. Recorrido en navegador de alta/edición/reparto/pagos y recarga; revisión visual de escritorio y móvil. Verificar despliegue y URL pública de Pages.
