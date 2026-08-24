FROM node:20-alpine AS base

FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/
COPY packages/ ./packages/
RUN npm ci

COPY apps/web/ ./apps/web/
WORKDIR /app/apps/web
# Skip typecheck for builder in this phase for speed, normally `npm run build`
RUN npx vite build

FROM nginx:alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
