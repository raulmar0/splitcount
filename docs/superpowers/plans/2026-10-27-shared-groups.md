# Shared groups Implementation Plan

> Implementación por tareas independientes con revisión final.

**Goal:** Compartir grupos de Entre por enlace y sincronizar sus gastos, con apariencia oscura y clara.
**Architecture:** GitHub Pages React + API Cloudflare Durable Objects; cambios atómicos por entidad, consulta periódica y caché local.
**Tech Stack:** React, Vite, Node test, Cloudflare cf CLI y Durable Objects SQLite.
**Spec:** docs/superpowers/specs/2026-10-27-shared-groups-design.md

## Restricciones

- Español, datos existentes conservados, importes en centavos.
- La clave del grupo va en fragmento y encabezado Authorization, nunca en query de API.
- No pérdida silenciosa por concurrencia ni falsa confirmación de guardado.
- Usar Impeccable y taste-skill; tema oscuro predeterminado y selección persistida.

## Tareas

- [x] Protocolo de cambios y backend persistente con pruebas de autorización y concurrencia.
- [x] Cliente API, enlaces, unión/identidad, sincronización periódica y estados de error.
- [x] Diseño oscuro/claro, tema persistido y controles nuevos adaptables.
- [ ] Pruebas entre clientes, revisión independiente, build y despliegues verificados.

## Verificación

128 pruebas automatizadas pasan, incluidas16 pruebas del hook de React en StrictMode y24 de la API. Build de frontend correcto y build/dry-run del Worker correctos. Backend desplegado y verificado con datos sintéticos (acceso, cambios paralelos, conflictos, persistencia y límites de cuerpo). Recorrido CUA en dos orígenes locales independientes: compartir, elegir identidad, crear/editar un gasto y registrar un pago; ambos clientes mostraron los mismos movimientos y saldos propios. Se confirmó409 al editar un gasto desactualizado, conservando el formulario.

Revisión visual en390px,768px y escritorio: oscuro/claro, sin desbordamiento horizontal, preferencia conservada al recargar. Impeccable se aplicó leyendo sus guías de modo Operate tras fallar el launcher por permisos. taste-skill generó dirección true-black-flat (semilla1298005779); lint de componentes0FAIL/0WARN. Revisión visual con CUA; no se ejecutó su inspector externo de navegador.
