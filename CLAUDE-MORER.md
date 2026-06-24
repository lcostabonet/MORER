# CLAUDE.md

## Proyecto
**MORER** es una marca/ecommerce de boardshorts construida con código propio. Debe funcionar como plataforma ecommerce automatizada, independiente y escalable.

Objetivo: **marca mediterránea + ecommerce code-first + drops + automatizaciones + comunidad + analítica**.

No propongas Shopify, Webflow, Wix u otros constructores visuales salvo petición explícita.

## Prioridades absolutas
1. No romper stock, checkout, pagos, pedidos, emails transaccionales ni permisos de admin.
2. El backend siempre es la fuente de verdad.
3. No confiar en precio, stock, descuento, pago o permisos enviados desde frontend.
4. Mantener el MVP simple antes de escalar.
5. No guardar secretos ni datos de tarjeta.
6. Antes de cambios grandes, proponer un plan.
7. Si un cambio afecta a pagos, stock, pedidos o admin, explica riesgos antes de modificar.

## Stack
Frontend: **Next.js, React, TypeScript, Tailwind CSS**.  
Backend: **NestJS, Node.js, TypeScript**.  
Datos: **PostgreSQL, Prisma**.  
Jobs: **Redis, BullMQ**.  
Pagos: **Stripe API**.  
Emails: **React Email, Resend/Postmark**.  
Validación: **Zod**.  
Testing: **Vitest, Playwright**.  
Infraestructura: **Docker, Git/GitHub**.

## Arquitectura monorepo
```text
morer/
├── apps/
│   ├── web/      # Frontend público Next.js
│   ├── api/      # Backend/API NestJS
│   └── admin/    # Panel interno
├── packages/
│   ├── database/ # Prisma, migraciones, seed
│   ├── ui/       # Componentes compartidos
│   ├── emails/   # Plantillas React Email
│   ├── types/    # Tipos compartidos
│   └── config/   # Configuración común
├── docs/
├── docker/
├── .env.example
└── README.md
```

## Apps
`apps/web`: home, shop, producto, drop, carrito, checkout, MORER Club, about, support, size guide, shipping y returns.  
Rutas: `/`, `/shop`, `/products/[slug]`, `/drops/[slug]`, `/cart`, `/checkout`, `/morer-club`, `/about`, `/support`, `/size-guide`, `/shipping`, `/returns`.

`apps/api`: fuente de verdad. Controla productos, variantes, stock, carrito, checkout, pedidos, pagos, clientes, eventos, automatizaciones, drops, reviews, UGC, emails, admin y seguridad.

`apps/admin`: panel interno para productos, variantes, stock, drops, pedidos, clientes, reviews, UGC, automatizaciones, emails, cambios, devoluciones y dashboard. Roles: `admin`, `operations`, `marketing`, `support`, `developer`.

## Reglas de trabajo
Explica cambios en español, paso a paso y de forma sencilla. Antes de cambios grandes, propone un plan.

Prioriza código claro, estructura ordenada, tipado fuerte, validación backend, seguridad, mantenibilidad y soluciones simples para MVP.

Evita sobreingeniería, duplicar lógica, confiar en datos del frontend, guardar secretos o tocar más archivos de los necesarios.

## Cuando falte contexto
No inventes arquitectura ni cambies stack sin justificar. No crees tablas nuevas sin explicar impacto. Propón una opción mínima y declara cualquier suposición. Pregunta solo si es imprescindible para no romper una parte crítica.

## Orden de desarrollo
```text
1 Preparación técnica
2 Base de datos
3 Backend base
4 Frontend base
5 Catálogo y productos
6 Stock y variantes
7 Carrito
8 Checkout y pagos
9 Pedidos
10 Emails transaccionales  ← Phase 10A: order_confirmation IMPLEMENTADO & E2E VALIDADO (2026-06-24)
11 Automatizaciones
12 Drops
13 MORER Club
14 Admin interno
15 Reviews y UGC
16 SEO técnico
17 Analítica
18 Seguridad
19 Testing
20 Lanzamiento
```

## MVP y non-goals
MVP obligatorio: base técnica, base de datos, backend de productos, frontend home/shop/producto, stock por talla, carrito, checkout, pedidos, email de confirmación y admin mínimo.

No objetivos por ahora: UGC avanzado, reviews completas, dashboard avanzado, tests A/B, recomendaciones, app móvil, marketplace, ERP, multiwarehouse, CMS complejo e internacionalización avanzada.

## Reglas frontend
El frontend debe mostrar datos, capturar intención del usuario, llamar a la API y mostrar errores claros. No debe calcular precio final, decidir stock real, aplicar descuentos finales, confirmar pagos ni cambiar estados de pedido directamente.

## Reglas backend
El backend debe validar todo input, calcular precio final, comprobar stock, controlar permisos, crear pedidos, procesar webhooks, emitir eventos y registrar errores relevantes. Usa Zod para validar entradas.

## Base de datos
Diseña pensando en **consistencia + automatización + escalabilidad**.

Flujo: `producto → variante → stock → carrito → pedido → pago → evento → automatización → email → analítica`.

Tablas iniciales:
```text
products, product_variants, inventory, customers, carts, cart_items, orders, order_items, payments, events, email_subscriptions, automation_jobs, admin_users
```

Tablas posteriores:
```text
drops, drop_products, reviews, ugc_posts, returns, exchanges, shipments, discounts, admin_audit_logs, webhook_events, redirects, stock_reservations, inventory_movements, product_images
```

No guardes stock directamente en `products`. Cada talla debe ser una variante: `products → product_variants → inventory`.

Stock disponible: `available_stock = stock_quantity - reserved_quantity`.

Estados de carrito: `active`, `abandoned`, `converted`, `expired`.  
Estados de pedido: `pending_payment`, `paid`, `fulfilled`, `cancelled`, `refunded`, `partially_refunded`, `returned`, `exchanged`.  
Estados de pago: `pending`, `succeeded`, `failed`, `refunded`, `partially_refunded`.

## Cambios en base de datos
Antes de cambiar modelos Prisma: explica qué tabla cambia, por qué, impacto en web/api/admin, crea migración, evita cambios destructivos sin confirmación y no borres columnas usadas por pedidos históricos.

## Pagos e idempotencia
Usa Stripe API. Nunca guardes datos de tarjeta. Guarda solo: `payment_id`, `stripe_payment_intent_id`, `status`, `amount`, `currency`, `order_id`, `created_at`.

Los webhooks pueden repetirse. Crea `webhook_events` con `provider`, `external_event_id`, `type`, `processed_at`. Antes de procesar un webhook, comprueba si ya fue procesado.

## Automatizaciones
Usa Redis + BullMQ. Automatizaciones iniciales: welcome flow, abandoned cart, post-purchase, review request, UGC request, low stock, back in stock, drop launch y early access.

Antes de ejecutar una automatización comprueba estado actual: carrito sigue abandonado, usuario no compró, producto disponible, usuario acepta emails y email no enviado previamente.

## Drops y MORER Club
Estados de drop: `draft`, `waitlist`, `early_access`, `live`, `sold_out`, `archived`.

Reglas: `draft` solo admin; `waitlist` público sin compra; `early_access` solo MORER Club; `live` público; `sold_out` no compra; `archived` histórico.

MORER Club debe guardar: `email`, `email_normalized`, `marketing_consent`, `source`, `subscribed_at`, `unsubscribed_at`.

## Emails
Usa React Email + Resend/Postmark. Emails mínimos: `welcome_01`, `abandoned_cart_01`, `order_confirmation`, `shipping_confirmation`, `review_request`, `ugc_request`, `drop_launch`, `back_in_stock`, `return_instructions`, `exchange_instructions`.

Variables típicas: `customer.first_name`, `product.name`, `cart.recovery_url`, `order.number`, `order.tracking_url`, `drop.name`, `variant.size`.

Variables de entorno requeridas en `apps/api`:
- `RESEND_API_KEY` — API key de Resend (empieza por `re_`).
- `EMAIL_FROM` — dirección remitente; `onboarding@resend.dev` en sandbox (entrega solo al propietario de la cuenta Resend). En producción, usar dominio verificado en Resend.

`order_confirmation` implementado y validado E2E (2026-06-24): se envía via Resend al recibir `payment_intent.succeeded`, `confirmationEmailSentAt` se guarda en DB.

## Admin interno
Usa roles y auditoría. Toda acción sensible debe dejar audit log: cambio de precio, edición de stock, creación de drop, cancelación de pedido, aprobación de review y aprobación de UGC.

Tabla recomendada: `admin_audit_logs: admin_user_id, action, entity_type, entity_id, metadata, created_at`.

## Seguridad
Nunca incluyas claves secretas, database password, service role keys, connection strings privadas, tokens, secretos de Stripe, secretos de email ni secretos JWT.

Usa `.env` y `.env.example`. El `.env.example` solo contiene nombres de variables, nunca valores reales.

El backend debe validar siempre precio, stock, permisos, descuento, estado del pedido, estado del pago, acceso a admin, webhooks y formularios. El frontend nunca es fuente de verdad.

## SEO, analítica y testing
SEO mínimo por producto/drop: `seo_title`, `seo_description`, `canonical_url`, `open_graph_image`, `schema_enabled`.

Eventos mínimos: `page_view`, `product_viewed`, `size_selected`, `add_to_cart`, `checkout_started`, `purchase_completed`, `email_subscribed`, `drop_viewed`, `stock_out`.

Testing: Vitest para lógica y Playwright para flujos críticos. Prueba carrito, talla, stock, checkout, pago de prueba, pedido, email, carrito abandonado, drop y admin por rol.

## Definition of Done
Una tarea está terminada cuando compila sin errores, pasa tests relacionados, no rompe tipos compartidos, valida datos en backend, no introduce secretos, mantiene flujos críticos funcionando, explica el cambio e indica cómo probarlo.

## Flujos críticos
No romper: ver producto, seleccionar talla, añadir al carrito, validar stock, iniciar checkout, pagar, crear pedido, actualizar stock, enviar email de confirmación y ver pedido en admin.

## Git
Antes de publicar:
```bash
git status
git diff
```

Después:
```bash
git add .
git commit -m "Mensaje descriptivo"
git push
```

No uses `git push --force` sin confirmación explícita.

## Regla final
MORER debe programarse primero como sistema y después como escaparate. Prioridad: **vender → automatizar → medir → operar → crecer**.

MORER debe sentirse como una marca pequeña, auténtica y mediterránea por fuera, pero funcionar por dentro como una plataforma ecommerce propia, automatizada, medible y preparada para escalar.
