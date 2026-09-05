FROM node:20-alpine AS base
RUN apk add --no-cache openssl ca-certificates fontconfig ttf-dejavu font-noto freetype

FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/
RUN npm ci

COPY apps/api/ ./apps/api/
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/
RUN npm ci --omit=dev

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
WORKDIR /app/apps/api
RUN npx prisma generate

EXPOSE 4000
CMD ["npm", "start"]
