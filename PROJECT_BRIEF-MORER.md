# PROJECT BRIEF: MORER

## 1. Resumen del proyecto

**MORER** es una marca/ecommerce de boardshorts construida con código propio. El proyecto busca crear una plataforma web rápida, clara, automatizada e independiente, capaz de vender productos físicos, gestionar stock por talla, procesar pedidos, lanzar drops, captar comunidad y medir resultados.

La web no debe plantearse como un simple escaparate, sino como una plataforma ecommerce code-first:

```text
Marca mediterránea
+ ecommerce propio
+ drops
+ automatizaciones
+ comunidad
+ analítica
```

La experiencia visual debe sentirse simple, cuidada y mediterránea, mientras que la arquitectura interna debe ser sólida, medible y preparada para escalar.

---

## 2. Alcance del proyecto

El proyecto incluye:

- Web pública de MORER.
- Catálogo de productos.
- Páginas de producto.
- Sistema de variantes y tallas.
- Control de stock por talla.
- Carrito.
- Checkout.
- Integración de pagos.
- Gestión de pedidos.
- Emails transaccionales.
- Sistema de drops.
- MORER Club como lista de comunidad y early access.
- Automatizaciones básicas.
- Admin interno.
- SEO técnico.
- Analítica de eventos.
- Base de datos propia.
- Seguridad básica para ecommerce.

El proyecto no debe depender de constructores visuales de webs como Shopify, Webflow, Wix o similares, salvo decisión explícita posterior.

---

## 3. Audiencia objetivo

MORER se dirige a:

- Personas que buscan boardshorts versátiles para verano.
- Clientes interesados en moda de baño cómoda y funcional.
- Usuarios que valoran estética mediterránea, sencillez y producto cuidado.
- Comunidad cercana a la marca: amigos, clientes, seguidores y compradores recurrentes.
- Público que compra por drops, colecciones limitadas o productos con narrativa.

La marca debe conectar con un estilo de vida de verano:

```text
playa
mar
barco
sol
movimiento
planes improvisados
comunidad
```

---

## 4. Objetivos principales

Los objetivos principales son:

1. Crear una web de ecommerce propia y escalable.
2. Vender boardshorts de forma clara y directa.
3. Gestionar tallas y stock sin errores.
4. Evitar sobreventa.
5. Procesar pedidos y pagos de forma segura.
6. Automatizar emails y flujos clave.
7. Lanzar productos mediante drops.
8. Captar emails mediante MORER Club.
9. Generar confianza mediante reviews y UGC.
10. Medir eventos para mejorar conversión.
11. Mantener una arquitectura limpia y mantenible.

La prioridad inicial es construir un MVP que pueda vender correctamente antes de añadir funciones avanzadas.

---

## 5. Funcionalidades clave

### 5.1. Web pública

La web debe incluir:

- Home.
- Shop.
- Página de producto.
- Página de drop.
- Carrito.
- Checkout.
- MORER Club.
- About.
- Support.
- Size Guide.
- Shipping.
- Returns.

Rutas principales:

```text
/
/shop
/products/[slug]
/drops/[slug]
/cart
/checkout
/morer-club
/about
/support
/size-guide
/shipping
/returns
```

---

### 5.2. Catálogo y producto

Cada producto debe incluir:

- Nombre.
- Slug.
- Descripción.
- Precio.
- Imágenes.
- Variantes por talla.
- Stock por talla.
- Estado del producto.
- Etiquetas comerciales.
- Metadatos SEO.
- Productos relacionados.

Ejemplos de etiquetas:

```text
New Drop
Best Seller
Low Stock
Sold Out
Last Sizes
Community Favourite
```

---

### 5.3. Stock y variantes

MORER vende productos físicos con tallas. Por tanto, cada talla debe tratarse como una variante.

Estructura conceptual:

```text
products
→ product_variants
→ inventory
```

El stock no debe guardarse directamente en `products`.

Stock disponible:

```text
available_stock = stock_quantity - reserved_quantity
```

El backend debe validar siempre el stock antes de permitir añadir al carrito o iniciar checkout.

---

### 5.4. Carrito

El carrito debe permitir:

- Crear carrito.
- Añadir producto.
- Seleccionar talla.
- Cambiar cantidad.
- Eliminar productos.
- Persistir carrito por sesión.
- Asociar carrito a email si el usuario lo deja.
- Calcular subtotal.
- Registrar eventos.

Eventos importantes:

```text
cart_created
cart_item_added
cart_item_removed
cart_updated
checkout_started
```

---

### 5.5. Checkout y pagos

El checkout debe permitir:

- Validar stock.
- Reservar stock temporalmente.
- Calcular total en backend.
- Crear sesión o intención de pago.
- Procesar webhooks.
- Confirmar pedido.
- Enviar email de confirmación.

El proveedor recomendado es:

```text
Stripe API
```

No se deben guardar datos de tarjeta.

---

### 5.6. Pedidos

Cada pedido debe guardar:

- Cliente.
- Productos comprados.
- Tallas.
- Cantidades.
- Precio final.
- Estado del pedido.
- Estado del pago.
- Dirección de envío.
- Fecha de creación.
- Historial de cambios relevantes.

Estados de pedido recomendados:

```text
pending_payment
paid
fulfilled
cancelled
refunded
partially_refunded
returned
exchanged
```

---

### 5.7. Emails

Emails mínimos:

```text
welcome_01
abandoned_cart_01
order_confirmation           ← IMPLEMENTADO & E2E VALIDADO (2026-06-24)
shipping_confirmation
review_request
ugc_request
drop_launch
back_in_stock
return_instructions
exchange_instructions
```

Tecnología recomendada:

```text
React Email + Resend/Postmark
```

Variables de entorno requeridas (`apps/api`):

| Variable | Descripción |
|---|---|
| `RESEND_API_KEY` | API key de Resend (resend.com, empieza por `re_`) |
| `EMAIL_FROM` | Remitente; `onboarding@resend.dev` en sandbox — entrega solo al propietario de la cuenta Resend. En producción, usar dominio verificado. |

---

### 5.8. Automatizaciones

Las automatizaciones deben basarse en eventos.

Automatizaciones iniciales:

- Welcome flow.
- Carrito abandonado.
- Postcompra.
- Review request.
- UGC request.
- Low stock.
- Back in stock.
- Drop launch.
- Early access.

Tecnología recomendada:

```text
Redis + BullMQ
```

---

### 5.9. Drops

MORER debe tener sistema de drops.

Estados de drop:

```text
draft
waitlist
early_access
live
sold_out
archived
```

Reglas:

```text
draft → solo admin
waitlist → público sin compra
early_access → solo MORER Club
live → público
sold_out → no compra
archived → histórico
```

---

### 5.10. MORER Club

MORER Club será la lista propia de comunidad, early access y restock alerts.

Debe guardar:

```text
email
email_normalized
marketing_consent
source
subscribed_at
unsubscribed_at
```

Funciones:

- Captar emails.
- Enviar bienvenida.
- Dar acceso anticipado a drops.
- Avisar de reposiciones.
- Segmentar usuarios.

---

### 5.11. Admin interno

El admin interno debe permitir gestionar:

- Productos.
- Variantes.
- Stock.
- Drops.
- Pedidos.
- Clientes.
- Reviews.
- UGC.
- Automatizaciones.
- Emails.
- Cambios.
- Devoluciones.
- Dashboard básico.

Roles recomendados:

```text
admin
operations
marketing
support
developer
```

Toda acción sensible debe dejar audit log.

---

### 5.12. Reviews y UGC

Funciones futuras:

- Reviews por producto.
- Moderación de reviews.
- UGC con permiso.
- Galería de comunidad.
- Fotos asociadas a producto.
- Aprobación desde admin.

Estados UGC:

```text
pending
approved
rejected
published
```

---

## 6. Estado actual del proyecto

El proyecto está en desarrollo activo.

Ya implementado y validado:

- enfoque code-first y monorepo;
- stack principal configurado;
- arquitectura frontend/backend;
- base de datos con Prisma y migraciones;
- backend NestJS operativo;
- checkout y pagos con Stripe (webhooks idempotentes);
- gestión de pedidos;
- **Phase 10A: email de confirmación de pedido via Resend — IMPLEMENTADO & E2E VALIDADO (2026-06-24)**
  - Migración `20260623180000_add_order_confirmation_email_sent_at` aplicada.
  - Webhook `payment_intent.succeeded` procesado correctamente (HTTP 200).
  - Pedido actualizado a estado `paid`, email enviado, `confirmationEmailSentAt` guardado en DB.
  - 45 tests pasan, typecheck y build limpios.

Todavía falta implementar:

- admin completo;
- automatizaciones (carrito abandonado, welcome flow, etc.);
- drops y MORER Club;
- reviews y UGC;
- SEO técnico avanzado;
- analítica de eventos;
- despliegue a producción.

---

## 7. Arquitectura técnica

Stack recomendado:

```text
Frontend:
Next.js + React + TypeScript + Tailwind CSS

Backend:
NestJS + Node.js + TypeScript

Base de datos:
PostgreSQL

ORM:
Prisma

Jobs:
Redis + BullMQ

Pagos:
Stripe API

Emails:
React Email + Resend/Postmark

Testing:
Vitest + Playwright

Infraestructura:
Docker + GitHub
```

---

## 8. Estructura del repositorio

Usar monorepo:

```text
morer/
├── apps/
│   ├── web/
│   ├── api/
│   └── admin/
├── packages/
│   ├── database/
│   ├── ui/
│   ├── emails/
│   ├── types/
│   └── config/
├── docs/
├── docker/
├── .env.example
└── README.md
```

---

## 9. Base de datos

Tablas iniciales:

```text
products
product_variants
inventory
customers
carts
cart_items
orders
order_items
payments
events
email_subscriptions
automation_jobs
admin_users
```

Tablas posteriores:

```text
drops
drop_products
reviews
ugc_posts
returns
exchanges
shipments
discounts
admin_audit_logs
webhook_events
redirects
stock_reservations
inventory_movements
product_images
```

Principios:

- El backend es la fuente de verdad.
- No confiar en el frontend para precio, stock o permisos.
- No guardar stock en `products`.
- Usar transacciones para operaciones críticas.
- Usar idempotencia para webhooks.
- Evitar borrado físico de datos históricos.
- Usar migraciones controladas.
- Mantener backups.

---

## 10. Seguridad

Nunca incluir en el repositorio:

- claves secretas;
- database password;
- service role keys;
- connection strings privadas;
- tokens;
- secretos de Stripe;
- secretos de email;
- secretos JWT.

Usar:

```text
.env
.env.example
```

El `.env.example` solo debe contener nombres de variables, nunca valores reales.

El backend debe validar:

- precio;
- stock;
- permisos;
- descuentos;
- estado del pedido;
- estado del pago;
- acceso a admin;
- webhooks;
- formularios.

No guardar datos de tarjeta. Stripe debe gestionar el flujo de pago.

---

## 11. SEO y analítica

SEO mínimo por producto y drop:

```text
seo_title
seo_description
canonical_url
open_graph_image
schema_enabled
```

Eventos mínimos:

```text
page_view
product_viewed
size_selected
add_to_cart
checkout_started
purchase_completed
email_subscribed
drop_viewed
stock_out
```

La analítica debe permitir responder:

- qué producto se ve más;
- qué producto convierte mejor;
- qué talla se selecciona más;
- dónde se abandona el checkout;
- qué drop funciona mejor;
- qué emails generan ventas.

---

## 12. Diseño y experiencia

La experiencia debe ser:

- clara;
- rápida;
- móvil;
- mediterránea;
- limpia;
- visual;
- orientada a conversión.

Principios UX:

- entender la marca en 5 segundos;
- mostrar beneficios rápido;
- hacer visible la guía de tallas;
- facilitar compra rápida;
- reducir dudas de envío y cambios;
- mostrar confianza;
- dar importancia a comunidad y UGC.

Elementos clave:

```text
Hero claro
Quick Add
Trust Bar
Size Guide
Low Stock
MORER Club
Worn by the community
FAQ
```

---

## 13. Suposiciones

- MORER se construirá con código propio.
- TypeScript será el lenguaje principal.
- El proyecto usará monorepo.
- El backend será fuente de verdad.
- Stripe gestionará pagos.
- PostgreSQL será la base principal.
- El MVP debe priorizar venta real antes de funcionalidades avanzadas.
- Las automatizaciones se construirán por eventos.
- MORER Club empezará como lista de email y early access.
- Reviews y UGC pueden ser fase posterior.

---

## 14. Requisitos no funcionales

- Rendimiento rápido en móvil.
- SEO técnico correcto.
- Seguridad en pagos y datos personales.
- Base de datos consistente.
- Stock fiable por talla.
- Arquitectura mantenible.
- Código tipado.
- Validación backend.
- Migraciones controladas.
- Logs para operaciones críticas.
- Admin con roles.
- Backups de base de datos.
- Testing de flujos críticos.

---

## 15. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Sobreventa de stock | Stock por variante, reservas y transacciones |
| Webhooks duplicados | Idempotencia con `webhook_events` |
| Precio manipulado desde frontend | Calcular precio siempre en backend |
| Secretos expuestos | `.env`, `.env.example` y revisión antes de commit |
| Drops mal controlados | Estados claros y validación backend |
| Admin inseguro | Roles y audit logs |
| Automatizaciones incorrectas | Comprobar estado antes de ejecutar jobs |
| Datos duplicados de clientes | `email_normalized` único |
| SEO débil | Campos SEO desde el modelo de datos |
| Cambios destructivos en DB | Migraciones y backups |
| Checkout roto | Tests E2E con Playwright |
| Falta de foco | Priorizar MVP |

---

## 16. Cronograma sugerido

1. Preparación técnica.
2. Base de datos.
3. Backend base.
4. Frontend base.
5. Catálogo y productos.
6. Stock y variantes.
7. Carrito.
8. Checkout y pagos.
9. Pedidos.
10. Emails transaccionales.
11. Automatizaciones.
12. Drops.
13. MORER Club.
14. Admin interno.
15. Reviews y UGC.
16. SEO técnico.
17. Analítica.
18. Seguridad.
19. Testing.
20. Lanzamiento.

---

## 17. MVP recomendado

El MVP debe incluir:

- web base;
- catálogo;
- producto;
- stock por talla;
- carrito;
- checkout;
- pago;
- creación de pedido;
- email de confirmación;
- admin mínimo;
- SEO básico;
- analítica básica.

No debe incluir inicialmente:

- UGC avanzado;
- reviews completas;
- dashboard avanzado;
- app móvil;
- marketplace;
- ERP;
- multiwarehouse;
- recomendaciones con IA;
- internacionalización avanzada.

---

## 18. Criterios de éxito

El proyecto será exitoso si:

- La web carga rápido en móvil.
- El usuario puede ver productos.
- El usuario puede seleccionar talla.
- El sistema valida stock real.
- El usuario puede añadir al carrito.
- El usuario puede pagar.
- Se crea un pedido correcto.
- El stock se actualiza correctamente.
- El cliente recibe email de confirmación.
- El admin puede ver productos, stock y pedidos.
- No se exponen secretos.
- Los webhooks son idempotentes.
- Las automatizaciones básicas funcionan.
- MORER Club capta emails.
- La web tiene SEO básico correcto.
- El sistema puede escalar sin rehacer toda la arquitectura.

---

## 19. Regla final

MORER debe programarse primero como sistema y después como escaparate.

Prioridad:

```text
vender
automatizar
medir
operar
crecer
```

La experiencia exterior debe ser simple, mediterránea y cuidada.  
La arquitectura interior debe ser sólida, segura, medible y escalable.
