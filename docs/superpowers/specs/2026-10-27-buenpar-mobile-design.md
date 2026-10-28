# Buenpar: identidad y experiencia mobile-first

El usuario pide un mejor nombre, un logo generado con ImageGen y rediseño genuinamente mobile-first. Se conserva el producto de gastos compartidos, temas oscuro/claro, API y compatibilidad de datos/enlaces.

## Identidad

Nombre elegido por el implementador: Buenpar. Evoca buena compañía y cuentas parejas. Logo original generado con ImageGen: dos formas enlazadas de color menta, con lectura de b/p. El activo generado se integra directamente; el wordmark es texto Manrope para nitidez y adaptación de tema. El prompt y la procedencia se documentan en docs/brand/logo-prompt.md.

## Producto desde el teléfono

- Inicio propio de Grupos con lista de planes, integrantes, moneda y saldo personal real por grupo. No se suman monedas diferentes.
- Navegación inferior persistente: Grupos, Gasto, Actividad y Ajustes. Áreas táctiles de al menos44px y safe area. El gasto principal queda al alcance del pulgar.
- Detalle del grupo con regreso a Grupos, título claro, saldo propio, total y pestañas Gastos/Saldos/Resumen. Las transferencias van a Saldos en móvil, sin duplicar una barra lateral al final de la lista.
- Registro de gastos en dos pasos: Importe y detalles básicos, luego Reparto. Fecha, categoría y nota se revelan progresivamente. Escrituras remotas esperan confirmación; errores conservan el borrador.
- Filtros en una hoja propia en teléfono. Actividad y Ajustes son pantallas, con selección de tema y respaldos en contexto.
- Formularios nativos a pantalla completa en teléfono y diálogo acotado en pantallas grandes; el pie de acciones permanece alcanzable sin quedar tapado por teclado o navegación.
- Navegación Atrás coherente con el historial del navegador. Abrir una invitación lleva al grupo y conserva los otros grupos.
- CSS base para320–430px; solo mejoras min-width para720px y1100px. La barra de grupos y la segunda columna aparecen como mejoras para escritorio.

## Compatibilidad

La URL pública y repositorio se conservan para no romper invitaciones. Claves localStorage entre-state-v1/entre-theme-v1 y API entre-sync siguen por compatibilidad. Solo cambia el nombre visible y los nombres de nuevas exportaciones. El backend de datos no requiere migración.

## Verificación

Suite existente y pruebas de navegación/formulario útiles; recorrido completo a390px (crear grupo, gasto, reparto exacto, compartir/identidad, filtros, saldos, tema y respaldo),320px y escritorio. Revisión de teclado, altura de formularios, primera acción visible, ausencia de scroll horizontal y datos conservados. Publicación en GitHub Pages y prueba de URL real.
