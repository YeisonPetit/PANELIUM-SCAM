# Architecture - Inkverse

## Overview
Inkverse is a professional reading platform for manhwa/manga/webtoons built as a monorepo containing a React frontend and an Express backend.

## Monorepo Structure
We use a domain-driven monorepo organized via `npm workspaces`:
- `apps/web`: React, Vite, Tailwind CSS, TanStack Query, Zustand.
- `apps/api`: Node.js, Express, TypeScript, Prisma.
- `packages/ui`: Shared React components (Atomic Design).
- `packages/types`: Shared TypeScript definitions (e.g. DTOs, Enums).
- `packages/config`: Shared configuration (TSConfig, ESLint).

## Technical Decisions
- **PostgreSQL + Prisma**: Provides strong relational data integrity for series, chapters, and users, along with excellent type-safety via Prisma.
- **Docker + Docker Compose**: Containerizes all services (postgres, redis, api, web) to ensure consistent local development and staging environments.
- **Redis**: Used for caching frequent queries (e.g. popular series) and session management.
- **Cloudflare R2**: Used for storing manga covers and pages, providing S3-compatible cheap and fast storage.

## UI/UX Direction
- Premium Dark UI (`#0A0B0F` base, `#7C5CFF` accent).
- Glassmorphism in navbar, glow effects on focus.
- Focus is on artwork rather than UI elements.
