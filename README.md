# Buenpar — gastos entre amigos

Una app en español para repartir gastos de viajes, hogares y planes con amigos. Diseñada desde el teléfono: crea grupos, añade gastos en dos pasos, consulta balances y registra pagos para saldar cuentas.

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

- **Grupos** es el inicio: cada plan muestra integrantes, moneda y saldo personal. Cada saldo conserva su moneda; no se suman monedas diferentes. En un grupo compartido sin identidad elegida se pide seleccionar un nombre.
- La navegación inferior en teléfono y tablet ofrece **Grupos, Gasto, Actividad y Ajustes**. Desde Gasto puedes elegir un grupo; dentro de uno, el gasto se registra allí.
- El formulario de gasto tiene dos pasos: importe, descripción y quién pagó; después, reparto por igual o por importes exactos. Fecha, categoría y nota se despliegan en **Más detalles**.
- El detalle del grupo contiene **Gastos, Saldos y Resumen**. Incluye edición y eliminación de gastos, búsqueda, filtros, orden y desglose por categoría. En teléfono, filtros y formularios abren una vista a pantalla completa; las transferencias sugeridas están en Saldos.
- Balances por persona y sugerencias para saldar cuentas. Los importes se calculan en centavos enteros; no se convierten monedas.
- Registro de pagos: anotar un pago solo actualiza las cuentas. **Buenpar no realiza transferencias de dinero.**
- Actividad reúne movimientos de todos los grupos. Ajustes contiene apariencia, respaldo e importación. En escritorio aparecen la barra lateral de grupos y una columna de transferencias.

Atrás cierra primero el formulario o filtro abierto y conserva el grupo de origen; después recorre el historial de pantallas. Mientras se confirma una escritura, el formulario permanece abierto. Recargar restaura la pantalla guardada en el historial del navegador cuando su grupo todavía existe.

## Compartir y sincronizar

Pulsa **Compartir**, escribe tu nombre y crea el enlace del grupo. Quien lo abra conserva sus otros grupos, entra al grupo invitado y elige su integrante (o añade su nombre) para ver su propio saldo. El grupo activo consulta gastos, pagos, integrantes y detalles cada tres segundos, además de al volver a la ventana o recuperar conexión. Las altas simultáneas se combinan; si dos personas editan el mismo movimiento, Buenpar avisa del conflicto sin reemplazar silenciosamente la otra edición.

**Cualquier persona que tenga el enlace puede ver y editar ese grupo.** La clave está en el fragmento de la URL y se envía a la API en `Authorization`; el servidor almacena solo su hash. No hay cuentas ni un directorio de grupos. Salir de un grupo lo quita de ese dispositivo y conserva el acceso de los demás.

Los grupos compartidos se guardan en un servicio persistente de Cloudflare con un Durable Object SQLite por grupo. Los grupos locales permanecen en `localStorage`; solo se suben cuando activas Compartir. Los tres grupos iniciales son ejemplos. Sin conexión puedes consultar la última copia; para guardar cambios compartidos se necesita conexión. Si falla una escritura, el formulario conserva el borrador y muestra el error.

En **Ajustes → Tus datos**, exporta una copia JSON para respaldar o trasladar todos tus datos. **Incluye las claves de los grupos compartidos: guárdala como una copia privada.** La importación se valida antes de reemplazar la copia local. El CSV exporta gastos del grupo para análisis y no reemplaza al respaldo JSON. Las nuevas descargas usan nombres `buenpar-respaldo.json` y `buenpar-<grupo>.csv`.

El tema inicial es oscuro. Puedes elegir claro u oscuro en Ajustes o con el botón de sol/luna de la barra superior. La preferencia se guarda en este navegador y se aplica antes de cargar React.

## Compatibilidad con datos existentes

El nombre visible cambió de Entre a Buenpar. Se conservan el repositorio, la URL pública, el formato de invitación y el servicio `entre-sync`. Las claves `entre-state-v1` y `entre-theme-v1` permanecen iguales para recuperar los grupos y la apariencia guardados. Los respaldos válidos anteriores siguen siendo compatibles; el cambio de identidad no requiere migración del backend.

## Servicio de sincronización

API desplegada: `https://entre-sync.raulhdz40.workers.dev`. Su código, pruebas, configuración de Cloudflare, límites y pasos de despliegue están en [sync-server](sync-server/README.md). El frontend puede apuntar a otra instancia con `VITE_SYNC_API`; por ejemplo, `VITE_SYNC_API=http://127.0.0.1:8787 npm run dev` para desarrollo con el backend local. No se necesita ninguna clave de servidor en el frontend.

## Publicación

El flujo [pages.yml](.github/workflows/pages.yml) instala con `npm ci`, ejecuta las pruebas, compila y publica `dist/` con las acciones oficiales de GitHub Pages. En el repositorio, selecciona **Settings → Pages → Source → GitHub Actions**. Cada cambio en `main` inicia el despliegue; también puede lanzarse manualmente desde Actions. La base relativa de Vite permite servir la app desde la ruta del repositorio.

Enlaces:

- Repositorio: [raulmar0/entre-app](https://github.com/raulmar0/entre-app).
- Aplicación: [raulmar0.github.io/entre-app](https://raulmar0.github.io/entre-app/).

## Diseño y referencias

React, Vite y Lucide, con Manrope y cifras tabulares. Buenpar usa un símbolo original generado con ImageGen y un wordmark de texto; su procedencia está en [logo-prompt.md](docs/brand/logo-prompt.md). El diseño oscuro/claro aplica [Impeccable](https://github.com/pbakaus/impeccable) y [taste-skill](https://github.com/Leonxlnx/taste-skill): superficies neutras, contraste legible, jerarquía sobre el saldo y controles conocidos. La dirección y sus adaptaciones están en [DESIGN.md](DESIGN.md); el contexto del producto, en [PRODUCT.md](PRODUCT.md).

Los patrones de Splitwise se consultaron originalmente mediante Mobbin como inspiración; no se incorporan capturas de Mobbin.

- [Grupo y lista de gastos](https://mobbin.com/screens/9f36de33-ee48-426a-b3df-65cba508f5b2).
- [Balances y pago de deuda](https://mobbin.com/screens/a65c5e3d-efa0-456e-8cf2-dc87f760e198).
- [Total del viaje y desglose](https://mobbin.com/screens/e7c36d66-c6c5-4422-a3ac-6c35db3fee8b).

La identidad y los flujos actuales están en [el diseño móvil de Buenpar](docs/superpowers/specs/2026-10-27-buenpar-mobile-design.md). [El diseño inicial de Entre](docs/superpowers/specs/2026-10-27-entre-design.md) conserva el contexto histórico.

La especificación de colaboración está en [grupos compartidos](docs/superpowers/specs/2026-10-27-shared-groups-design.md).
