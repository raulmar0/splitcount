# Entre — las cuentas claras

Una app en español para repartir gastos de viajes y planes con amigos: crea grupos, añade gastos, consulta balances y registra los pagos para saldar cuentas.

## Desarrollo local

Necesitas Node.js 24 y npm.

```sh
npm install
npm run dev
```

Abre la dirección que muestra Vite en la terminal. Para comprobar y compilar:

```sh
npm test
npm run build
npm run preview
```

La versión estática se genera en `dist/`. Antes de proponer cambios, ejecuta las pruebas y la compilación.

## Cómo funciona

- Grupos con integrantes y moneda propia; gastos repartidos por partes iguales o por importes exactos.
- Edición y eliminación de gastos, búsqueda, filtros y desglose por categoría.
- Balances por persona y sugerencias para saldar cuentas. Los importes se calculan en centavos enteros; no se convierten monedas.
- Registro de pagos: anotar un pago solo actualiza las cuentas. **Entre no realiza transferencias de dinero.**

Los datos se guardan únicamente en `localStorage` de este navegador. Esta versión no tiene inicio de sesión, servidor, sincronización entre dispositivos ni colaboración en tiempo real. Los tres grupos iniciales contienen datos de ejemplo y puedes eliminarlos desde sus opciones.

Exporta una copia JSON para conservar todos tus datos o trasladarlos a otro navegador; importa esa copia para restaurarlos. La importación reemplaza los datos locales después de validar el archivo. También puedes exportar los gastos en CSV para analizarlos en una hoja de cálculo; el CSV no sustituye a la copia JSON. Borrar los datos del sitio o usar otro navegador no conserva tus registros: guarda una copia JSON antes.

## Publicación

El flujo [pages.yml](.github/workflows/pages.yml) instala con `npm ci`, ejecuta las pruebas, compila y publica `dist/` con las acciones oficiales de GitHub Pages. En el repositorio, selecciona **Settings → Pages → Source → GitHub Actions**. Cada cambio en `main` inicia el despliegue; también puede lanzarse manualmente desde Actions. La base relativa de Vite permite servir la app desde la ruta del repositorio.

Enlaces:

- Repositorio: [raulmar0/entre-app](https://github.com/raulmar0/entre-app).
- Aplicación: [raulmar0.github.io/entre-app](https://raulmar0.github.io/entre-app/).

## Diseño y referencias

React, Vite y Lucide. El diseño de Entre usa una paleta marfil, verde y lima con tipografía Manrope. Los patrones de Splitwise se consultaron mediante Mobbin como inspiración; la interfaz es una implementación propia y no incorpora capturas de Mobbin.

- [Grupo y lista de gastos](https://mobbin.com/screens/9f36de33-ee48-426a-b3df-65cba508f5b2).
- [Balances y pago de deuda](https://mobbin.com/screens/a65c5e3d-efa0-456e-8cf2-dc87f760e198).
- [Total del viaje y desglose](https://mobbin.com/screens/e7c36d66-c6c5-4422-a3ac-6c35db3fee8b).

Las decisiones de producto y validación están en [el diseño de Entre](docs/superpowers/specs/2026-10-27-entre-design.md).

Foto de portada: [Unsplash](https://unsplash.com), utilizada como recurso visual local.
