# Entre: grupos compartidos y apariencia

El usuario pide compartir grupos por enlace, sincronizar los gastos entre amigos, tema oscuro por defecto y selector de tema, aplicando Impeccable y taste-skill para eliminar diseño genérico.

## Comportamiento

- Los grupos locales existentes se conservan. Compartir es una acción explícita que sube solo ese grupo.
- La app permanece en GitHub Pages; un nuevo Worker Cloudflare persistente aloja un Durable Object SQLite por grupo.
- El enlace contiene un identificador aleatorio y una clave de 256 bits en el fragmento. Cualquier persona con ese enlace puede leer y editar el grupo. No hay listado de grupos ni cuentas de usuario.
- Al compartir, el creador asigna su nombre real al integrante local Tú. Al abrir un enlace, cada amigo elige su integrante. Esa identidad se guarda solo en su navegador.
- Lectura automática cada tres segundos y al cambiar de pestaña/recuperar foco. Gastos, pagos, integrantes y detalles se sincronizan.
- Los cambios se envían como diferencias por entidad, se aplican en serie y se validan antes de persistir. Altas simultáneas no se pisan. Ediciones concurrentes del mismo gasto muestran un conflicto y la versión más reciente.
- Un error de red conserva el formulario sin simular guardado. La última copia descargada permanece visible y el estado de conexión es explícito.
- Eliminar un grupo compartido significa salir en ese dispositivo; los demás conservan su acceso.
- El respaldo JSON conserva los enlaces y debe tratarse como una copia privada. Importar no sube automáticamente grupos locales.
- Tema oscuro inicial, claro opcional; preferencia persistida y aplicada antes de pintar.

## Diseño

Modo Operate de Impeccable: controles conocidos, jerarquía clara, estados completos. taste-skill: true-black-flat, semilla 1298005779, adaptado a la barra de grupos existente y a Manrope. Neutros cálidos oscuros, superficies planas, contraste legible, cifras tabulares, un verde discreto para datos. Sin hero fotográfico ni slogans por encima de los datos, iconos en cuadros pastel ni adornos repetidos. Título: nombre del grupo. Saldo propio como cifra principal. Selector de apariencia accesible.

## Alternativas

Un enlace con un JSON estático no sincroniza; se descarta. Un servicio nuevo con cuentas obligatorias añade alta y permisos ajenos al pedido. La cuenta Cloudflare existente permite un servicio pequeño y persistente con acceso por enlace sin cambiar la URL de la app.

## Validación

Pruebas de protocolo (altas simultáneas, conflictos, idempotencia y grupos inválidos), auth y CORS, cliente y preferencia de tema; suite monetaria existente. Prueba del backend local y desplegado. Dos clientes independientes comparten un grupo, añaden y editan gastos y observan el mismo saldo. Revisión visual oscuro/claro a 390, 768 y escritorio. Publicar código y actualizar GitHub Pages.
