# Splitcount — gastos entre amigos

Una app en español para repartir gastos de viajes, hogares y planes con amigos. Diseñada desde el teléfono: crea grupos, añade gastos en dos pasos, consulta balances y registra pagos para saldar cuentas.

## Desarrollo local

Necesitas Node.js 24 y npm.

```sh
npm install
npm ci --prefix sync-server
npm run dev
```

Abre la dirección que muestra Vite en la terminal. Para comprobar y compilar:

```sh
npm test
npm run build
npm run preview
```

La versión estática se genera en `dist/`. Antes de proponer cambios, ejecuta las pruebas y la compilación.

## Instalar como app (PWA)

En Android o Chrome/Edge de escritorio, usa la opción **Instalar aplicación** del navegador. En iPhone/iPad, abre Splitcount en Safari y elige **Compartir → Añadir a pantalla de inicio**. Se abre como una app independiente con su propio icono.

La versión de producción incluye un service worker que guarda la interfaz y sus recursos para abrirla sin conexión después de una primera visita conectada y de que termine la instalación del worker. Los grupos locales siguen permitiendo cambios sin conexión; los compartidos muestran su última copia y necesitan conexión para guardar. La API de grupos no se cachea en el service worker. La fuente de Google puede sustituirse por la fuente del sistema sin conexión.

Las actualizaciones se preparan en segundo plano y se activan al cerrar todas las ventanas de Splitcount y volver a abrirla, sin forzar una recarga mientras editas. No borran `localStorage` ni los grupos. La PWA requiere HTTPS (o localhost); para probarla localmente usa `npm run build` y `npm run preview`, no el servidor de desarrollo.

## Cómo funciona

- **Grupos** es el inicio: cada plan muestra integrantes, moneda y saldo personal. Cada saldo conserva su moneda; no se suman monedas diferentes. En un grupo compartido sin identidad elegida se pide seleccionar un nombre.
- La navegación inferior en teléfono y tablet ofrece **Grupos, Gasto, Actividad y Ajustes**. Desde Gasto puedes elegir un grupo; dentro de uno, el gasto se registra allí.
- El formulario de gasto tiene dos pasos: importe, descripción y quién pagó; después, reparto por igual o por importes exactos. Fecha, categoría y nota se despliegan en **Más detalles**.
- El detalle del grupo contiene **Gastos, Saldos y Resumen**. Incluye edición y eliminación de gastos, búsqueda, filtros, orden y desglose por categoría. En teléfono, filtros y formularios abren una vista a pantalla completa; las transferencias sugeridas están en Saldos.
- Balances por persona y sugerencias para saldar cuentas. Los importes se calculan en centavos enteros; no se convierten monedas.
- Registro de pagos: anotar un pago solo actualiza las cuentas. **Splitcount no realiza transferencias de dinero.**
- Actividad reúne movimientos de todos los grupos. Ajustes contiene apariencia, respaldo e importación. En escritorio aparecen la barra lateral de grupos y una columna de transferencias.

Atrás cierra primero el formulario o filtro abierto y conserva el grupo de origen; después recorre el historial de pantallas. Mientras se confirma una escritura, el formulario permanece abierto. Recargar restaura la pantalla guardada en el historial del navegador cuando su grupo todavía existe.

## Compartir y sincronizar

Pulsa **Compartir**, escribe tu nombre y crea el enlace del grupo. Quien lo abra conserva sus otros grupos, entra al grupo invitado y elige su integrante (o añade su nombre) para ver su propio saldo. El grupo activo consulta gastos, pagos, integrantes y detalles cada tres segundos, además de al volver a la ventana o recuperar conexión. Las altas simultáneas se combinan; si dos personas editan el mismo movimiento, Splitcount avisa del conflicto sin reemplazar silenciosamente la otra edición.

**Cualquier persona que tenga el enlace puede ver y editar ese grupo.** La clave está en el fragmento de la URL y se envía a la API en `Authorization`; el registro del grupo almacena solo su hash. El acceso con Google no cambia este permiso y no hay un directorio público. El directorio privado de tu cuenta conserva la clave para recuperar el grupo en otro dispositivo. Sin cuenta, salir quita el grupo de ese dispositivo; con cuenta, lo quita de todos tus dispositivos. Los demás conservan su acceso.

Los grupos en línea se guardan en un servicio persistente de Cloudflare con un Durable Object SQLite por grupo. En modo invitado, los grupos locales permanecen en `localStorage`; solo se suben al activar Compartir o al elegir incorporarlos a una cuenta. Los grupos nuevos se crean locales por defecto, también con sesión iniciada; con Google puedes elegir **Compartido** al crearlos. Compartir un grupo local lo convierte en uno en línea y ocupa un lugar en el cupo. Los tres grupos iniciales son ejemplos. Sin conexión puedes consultar la última copia disponible; para guardar cambios en línea se necesita conexión. Si falla una escritura, el formulario conserva el borrador y muestra el error.

En **Ajustes → Tus datos**, exporta una copia JSON para respaldar o trasladar todos tus datos. **Incluye las claves de los grupos compartidos: guárdala como una copia privada.** La importación se valida antes de reemplazar la copia local. El CSV exporta gastos del grupo para análisis y no reemplaza al respaldo JSON. Las nuevas descargas usan nombres `splitcount-respaldo.json` y `splitcount-<grupo>.csv`.

El tema inicial es oscuro. Puedes elegir claro u oscuro en Ajustes o con el botón de sol/luna de la barra superior. La preferencia se guarda en este navegador y se aplica antes de cargar React.
## Límites de grupos

- **Sin cuenta:** grupos locales ilimitados y hasta **1 grupo compartido** en el espacio invitado de este navegador.
- **Con Google:** grupos locales ilimitados y hasta **6 grupos compartidos** por cuenta, entre todos sus dispositivos.
- Cuentan tanto los grupos creados como los aceptados por invitación o incorporados a la cuenta. Salir de un compartido libera un lugar; volver a abrir uno que ya tienes no consume otro. Los grupos de ejemplo son locales.
- No hay límite por cantidad de gastos o pagos. Siguen vigentes los límites técnicos de tamaño del servicio (256 KiB por grupo o solicitud).

Los grupos existentes que ya superen el cupo conservan sus datos y permiten ediciones; para añadir otro compartido hay que liberar espacio. Restaurar un respaldo sin cuenta valida el cupo antes de reemplazar los datos. El límite invitado se aplica en el navegador: sin registro no existe una identidad persistente en el servidor para imponerlo por persona. Estos cupos reducen uso; no garantizan por sí solos que el consumo total del servicio permanezca en el plan gratis.

## Acceso opcional con Google

En **Ajustes → Cuenta**, entra con Google para recuperar tus grupos, gastos, pagos y la identidad elegida en cada grupo en cualquier dispositivo. Puedes tener hasta **6 grupos compartidos** en tu cuenta y **grupos locales ilimitados**. Al crear un grupo, elige si se guarda localmente o se sincroniza con tu cuenta; los locales se guardan solo en este navegador. Puedes seguir usando el modo invitado sin registrarte; la cuenta de Google no restringe los enlaces compartidos ni convierte la selección de integrante en un permiso de edición.

Los datos previos del modo invitado no se suben automáticamente: usa **Añadir grupos de este dispositivo**, elige los grupos y confirma. Los ejemplos aparecen aparte, sin seleccionar. Sus copias originales se conservan. Los reintentos no duplican grupos; si cambiaste una copia local ya incorporada y no puede reconciliarse con seguridad, se muestra el conflicto sin sobrescribirla.

La lista de grupos de la cuenta se recupera al entrar, cada 15 segundos y al volver a la ventana o recuperar conexión. El grupo activo conserva su actualización cada tres segundos. Mientras tienes un formulario abierto, se difiere la recuperación de la lista para no desmontar su borrador. Las modificaciones independientes se combinan y los conflictos se muestran.

Cada cuenta usa una caché separada; el modo invitado conserva `entre-state-v1`. **Cerrar sesión limpia la caché de los grupos compartidos de esa cuenta en este navegador** y conserva sus grupos locales para cuando vuelvas a entrar con la misma cuenta, sin borrar los grupos de Cloudflare ni los datos invitados. El perfil y el ID token de Google permanecen solo en memoria; recargar o vencer la sesión requiere volver a entrar. Si vence mientras editas, puedes volver a entrar desde el mismo formulario, sin perder el borrador. Para cambiar de cuenta, cierra sesión primero. No se guardan tokens de Google en `localStorage`, `sessionStorage` ni respaldos; los respaldos sí contienen las claves privadas de los grupos.

Importar un respaldo sin sesión conserva el comportamiento de reemplazo local. Con sesión, añade los compartidos a la cuenta y conserva los locales en este navegador, sin borrar los existentes; vincular un grupo compartido conserva su versión actual en línea. Reintentar omite copias locales idénticas y avisa si el mismo ID tiene datos diferentes, sin sobrescribirlos. Si falla una incorporación, las anteriores que terminaron permanecen guardadas.

El Client ID público está en `src/google-config.js`; Cloudflare recibe el mismo valor mediante el binding `GOOGLE_CLIENT_ID`. El flujo usa Google Identity Services con popup y callback, sin secreto OAuth ni URI de redirección. **No copies el JSON de credenciales al repositorio ni al frontend.**

El proyecto de Google Cloud es `splitcount-raulmar`. El cliente **Splitcount Web** autoriza `https://raulmar0.github.io`, `http://localhost`, `http://localhost:5173` y `http://127.0.0.1:5173`. Los orígenes no incluyen rutas como `/splitcount/`; otros puertos de desarrollo requieren agregarlos al cliente OAuth. Google Auth Platform está en modo de prueba. Este acceso usa únicamente Sign in with Google y los datos básicos de identidad; Google permite otras cuentas sin incluirlas como usuarios de prueba para este flujo ([excepción de identidad básica](https://support.google.com/cloud/answer/15549945?hl=en)). La aprobación de Splitcount se aplica en el Worker, después de verificar la identidad con Google.

## Aprobación de cuentas y administración

Las cuentas de Google nuevas envían una solicitud de acceso y quedan **pendientes** hasta que el administrador las apruebe. Mientras esperan funcionan igual que en modo invitado: grupos locales ilimitados y **1 grupo compartido** en el espacio invitado de este navegador. Pueden crearlo o aceptar una invitación, editar sus movimientos y elegir su identidad sin usar las rutas de la cuenta. Ese espacio se conserva al iniciar/cerrar sesión o vencer Google. Tras aprobarlas, pulsan **Comprobar aprobación** en Ajustes para abrir su espacio de cuenta con hasta seis compartidos. Los grupos invitados permanecen en este dispositivo y pueden incorporarse explícitamente desde **Añadir grupos de este dispositivo**, sin subir nada automáticamente. El acceso por enlaces del modo invitado conserva sus permisos.

El panel **Ajustes → Administración** solo está disponible para la identidad de Google verificada **raulhdz40@gmail.com**. Permite consultar pendientes, aprobadas y rechazadas; aprobar, rechazar o revocar la sincronización. Cada cambio comprueba la versión de la solicitud para impedir que dos dispositivos sobrescriban decisiones recientes. La cuenta administradora conserva su acceso. Las cuentas que aún no estén en el registro de aprobaciones deben solicitar acceso al entrar, aunque conserven datos anteriores; no se borran sus grupos.

En **Notificaciones de solicitudes**, activa los avisos en cada dispositivo y acepta el permiso del navegador. Puedes **Enviar prueba** y desactivarlos desde el mismo panel. Web Push funciona con la app cerrada en navegadores compatibles; en iPhone/iPad requiere abrir la app añadida a Inicio desde Safari. Las notificaciones usan un texto genérico, sin nombres ni correos de solicitantes. Tocarlas abre el panel o enfoca una ventana existente conservando sus formularios. Puede ser necesario entrar otra vez con Google porque los tokens no se guardan.

El primer acceso de una cuenta genera una sola solicitud y un intento de aviso; repetir el acceso no envía duplicados. Un fallo push no pierde la solicitud: el panel sigue siendo la fuente de las cuentas pendientes. Solo se guardan hasta diez dispositivos de notificaciones. Las claves VAPID se generan y conservan en el registro privado de Cloudflare; no necesitas un proveedor de notificaciones de pago ni copiar claves privadas al frontend. El permiso se solicita únicamente al pulsar **Activar en este dispositivo**.

Para publicar esta función, despliega primero el Worker con el export **AccessRegistry** y el binding **ACCESS**, conservando **GROUPS** y **ACCOUNTS**, y después el frontend. Sin el registro de acceso configurado, el servidor bloquea la sincronización de cuentas. Las notificaciones reales deben comprobarse desde la app publicada; las pruebas locales verifican el protocolo y la interfaz, no la entrega del navegador.

## Compatibilidad con datos existentes

El nombre visible es Splitcount; antes se llamó Buenpar y Entre. El repositorio es `raulmar0/splitcount` y la aplicación se publica en `/splitcount/`. Se conservan el formato de invitación y el servicio `entre-sync`. Las claves `entre-state-v1` y `entre-theme-v1` permanecen iguales para recuperar los grupos y la apariencia guardados en el mismo origen. El historial del navegador conserva su propiedad interna `buenpar` para restaurar la pantalla y mantener el comportamiento de Atrás. Los respaldos válidos anteriores siguen siendo compatibles; el cambio de identidad no requiere migración del backend.

Las nuevas invitaciones usan la ruta `/splitcount/`. Para abrir una invitación anterior, cambia únicamente `/entre-app/` por `/splitcount/` y conserva completo el fragmento `#grupo=…`; su clave de acceso sigue siendo válida.

## Servicio de sincronización

API desplegada: `https://entre-sync.raulhdz40.workers.dev`. Su código, pruebas, configuración de Cloudflare, límites y pasos de despliegue están en [sync-server](sync-server/README.md). El frontend puede apuntar a otra instancia con `VITE_SYNC_API`; por ejemplo, `VITE_SYNC_API=http://127.0.0.1:8787 npm run dev` para desarrollo con el backend local. No se necesita ninguna clave de servidor en el frontend.

## Publicación

El flujo [pages.yml](.github/workflows/pages.yml) instala las dependencias del frontend y del Worker, ejecuta las pruebas, compila y publica `dist/` con las acciones oficiales de GitHub Pages. En el repositorio, selecciona **Settings → Pages → Source → GitHub Actions**. Cada cambio en `main` inicia el despliegue; también puede lanzarse manualmente desde Actions. La base relativa de Vite permite servir la app desde la ruta del repositorio.

Para publicar la sincronización de cuentas, despliega primero el Worker con el nuevo binding `ACCOUNTS` y el export `AccountDirectory`, sin reemplazar `GROUPS` ni `GroupLedger`; después publica el frontend. Los pasos y límites están en `sync-server/README.md`.

Enlaces:

- Repositorio: [raulmar0/splitcount](https://github.com/raulmar0/splitcount).
- Aplicación: [raulmar0.github.io/splitcount](https://raulmar0.github.io/splitcount/).

## Diseño y referencias

React, Vite y Lucide, con Manrope y cifras tabulares. Splitcount usa la opción **Reparto** elegida entre tres propuestas de ImageGen: tres formas mint separadas por un espacio en Y, acompañadas por un wordmark de texto. Su procedencia y refinamiento están en [splitcount-logo.md](docs/brand/splitcount-logo.md). El diseño oscuro/claro aplica [Impeccable](https://github.com/pbakaus/impeccable) y [taste-skill](https://github.com/Leonxlnx/taste-skill): superficies neutras, contraste legible, jerarquía sobre el saldo y controles conocidos. La dirección y sus adaptaciones están en [DESIGN.md](DESIGN.md); el contexto del producto, en [PRODUCT.md](PRODUCT.md).

Los patrones de Splitwise se consultaron originalmente mediante Mobbin como inspiración; no se incorporan capturas de Mobbin.

- [Grupo y lista de gastos](https://mobbin.com/screens/9f36de33-ee48-426a-b3df-65cba508f5b2).
- [Balances y pago de deuda](https://mobbin.com/screens/a65c5e3d-efa0-456e-8cf2-dc87f760e198).
- [Total del viaje y desglose](https://mobbin.com/screens/e7c36d66-c6c5-4422-a3ac-6c35db3fee8b).

Los flujos móviles se definieron en [el diseño móvil bajo el nombre Buenpar](docs/superpowers/specs/2026-10-27-buenpar-mobile-design.md). Esa especificación, [la identidad anterior de Buenpar](docs/brand/logo-prompt.md) y [el diseño inicial de Entre](docs/superpowers/specs/2026-10-27-entre-design.md) conservan el contexto histórico. La identidad actual es Splitcount y su símbolo Reparto.

La especificación de colaboración está en [grupos compartidos](docs/superpowers/specs/2026-10-27-shared-groups-design.md).
