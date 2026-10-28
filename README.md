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

## Compartir y sincronizar

Pulsa **Compartir**, escribe tu nombre y crea el enlace del grupo. Quien lo abra elige su integrante (o añade su nombre) y ve su propio saldo. Gastos, pagos, integrantes y detalles se actualizan automáticamente cada tres segundos, además de al volver a la ventana. Las altas simultáneas se combinan; si dos personas editan el mismo movimiento, Entre avisa del conflicto sin reemplazar silenciosamente la otra edición.

**Cualquier persona que tenga el enlace puede ver y editar ese grupo.** La clave está en el fragmento de la URL y se envía a la API en `Authorization`; el servidor almacena solo su hash. No hay cuentas ni un directorio de grupos. Salir de un grupo lo quita de ese dispositivo y conserva el acceso de los demás.

Los grupos compartidos se guardan en un servicio persistente de Cloudflare con un Durable Object SQLite por grupo. Los grupos locales permanecen en `localStorage`; solo se suben cuando activas Compartir. Los tres grupos iniciales son ejemplos. Sin conexión puedes consultar la última copia; para guardar cambios compartidos se necesita conexión. Si falla una escritura, el formulario conserva el borrador y muestra el error.

Exporta una copia JSON para respaldar o trasladar todos tus datos. **Incluye las claves de los grupos compartidos: guárdala como una copia privada.** La importación se valida antes de reemplazar la copia local. El CSV exporta gastos para análisis y no reemplaza al respaldo JSON.

El tema inicial es oscuro. El botón de sol/luna en la barra superior cambia a claro u oscuro y guarda la preferencia en este navegador.

## Servicio de sincronización

API desplegada: `https://entre-sync.raulhdz40.workers.dev`. Su código, pruebas, configuración de Cloudflare, límites y pasos de despliegue están en [sync-server](sync-server/README.md). El frontend puede apuntar a otra instancia con `VITE_SYNC_API`; por ejemplo, `VITE_SYNC_API=http://127.0.0.1:8787 npm run dev` para desarrollo con el backend local. No se necesita ninguna clave de servidor en el frontend.

## Publicación

El flujo [pages.yml](.github/workflows/pages.yml) instala con `npm ci`, ejecuta las pruebas, compila y publica `dist/` con las acciones oficiales de GitHub Pages. En el repositorio, selecciona **Settings → Pages → Source → GitHub Actions**. Cada cambio en `main` inicia el despliegue; también puede lanzarse manualmente desde Actions. La base relativa de Vite permite servir la app desde la ruta del repositorio.

Enlaces:

- Repositorio: [raulmar0/entre-app](https://github.com/raulmar0/entre-app).
- Aplicación: [raulmar0.github.io/entre-app](https://raulmar0.github.io/entre-app/).

## Diseño y referencias

React, Vite y Lucide, con Manrope y cifras tabulares. El rediseño oscuro/claro aplica [Impeccable](https://github.com/pbakaus/impeccable) y [taste-skill](https://github.com/Leonxlnx/taste-skill): superficies neutras, contraste legible, jerarquía sobre el saldo y controles conocidos. La dirección y sus adaptaciones están en [DESIGN.md](DESIGN.md); el contexto del producto, en [PRODUCT.md](PRODUCT.md).

Los patrones de Splitwise se consultaron originalmente mediante Mobbin como inspiración; no se incorporan capturas de Mobbin.
- [Grupo y lista de gastos](https://mobbin.com/screens/9f36de33-ee48-426a-b3df-65cba508f5b2).
- [Balances y pago de deuda](https://mobbin.com/screens/a65c5e3d-efa0-456e-8cf2-dc87f760e198).
- [Total del viaje y desglose](https://mobbin.com/screens/e7c36d66-c6c5-4422-a3ac-6c35db3fee8b).

Las decisiones de producto y validación están en [el diseño de Entre](docs/superpowers/specs/2026-10-27-entre-design.md).

La especificación de colaboración está en [grupos compartidos](docs/superpowers/specs/2026-10-27-shared-groups-design.md).
