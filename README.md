# MORER

Marca mediterránea de boardshorts. Plataforma ecommerce code-first, automatizada y escalable.

## Stack

| Capa        | Tecnología                          |
|-------------|-------------------------------------|
| Frontend    | Next.js 15, React, TypeScript, Tailwind CSS |
| Backend     | NestJS, Node.js, TypeScript         |
| Base de datos | PostgreSQL, Prisma                |
| Jobs        | Redis, BullMQ                       |
| Pagos       | Stripe                              |
| Emails      | React Email, Resend                 |
| Validación  | Zod                                 |
| Testing     | Vitest, Playwright                  |
| Infra       | Docker, GitHub Actions              |

## Estructura

```
morer/
├── apps/
│   ├── web/        # Frontend público (Next.js) — :3000
│   ├── api/        # Backend/API (NestJS)        — :4000
│   └── admin/      # Panel interno (Next.js)     — :3001
├── packages/
│   ├── database/   # Prisma, migraciones, seed
│   ├── ui/         # Componentes React compartidos
│   ├── emails/     # Plantillas React Email
│   ├── types/      # Tipos TypeScript compartidos
│   └── config/     # Configuración común
├── docs/
├── docker/
├── .env.example
└── README.md
```

## Requisitos

- Node.js >= 20
- pnpm >= 9
- Docker Desktop

## Instalación

```bash
pnpm install
```

## Infraestructura local

```bash
# Arrancar PostgreSQL y Redis en background
docker compose up -d

# Ver estado y healthchecks
docker compose ps

# Parar servicios (conserva datos)
docker compose stop

# Parar y eliminar contenedores (conserva volúmenes)
docker compose down

# ⚠️ Elimina contenedores Y volúmenes — se pierden todos los datos locales
docker compose down -v
```

| Servicio    | Puerto |
|-------------|--------|
| PostgreSQL  | 5432   |
| Redis       | 6379   |

Copia `.env.example` a `.env` y rellena las variables antes de arrancar las apps.

## Desarrollo

```bash
pnpm dev
```

| App   | URL                      |
|-------|--------------------------|
| web   | http://localhost:3000    |
| admin | http://localhost:3001    |
| api   | http://localhost:4000    |

## Comandos útiles

```bash
pnpm build       # Build de todos los workspaces
pnpm typecheck   # Verificar tipos en todo el monorepo
pnpm lint        # Lint en todos los workspaces
pnpm format      # Formatear con Prettier
pnpm test        # Tests en todos los workspaces
```
