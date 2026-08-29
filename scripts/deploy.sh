#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Script de despliegue para paneliumscan.com
#  Cloudflare SSL Full/Strict + Certbot + Docker
# ═══════════════════════════════════════════════════════════════
set -e

DOMAIN="paneliumscan.com"
EMAIL="tu-email@ejemplo.com"   # ← Cambia esto por tu email real
APP_DIR="/opt/panelium"

echo "🚀 Iniciando despliegue de $DOMAIN..."

# ─── 1. Instalar dependencias del sistema ──────────────────────
echo "📦 Instalando dependencias..."
apt-get update -y
apt-get install -y certbot nginx

# ─── 2. Obtener certificado SSL con Certbot ────────────────────
echo "🔐 Obteniendo certificado SSL para $DOMAIN..."

# Detener nginx si está corriendo para liberar el puerto 80
systemctl stop nginx 2>/dev/null || true
docker compose -f $APP_DIR/docker-compose.prod.yml stop web 2>/dev/null || true

# Obtener certificado (modo standalone usa el puerto 80 directamente)
certbot certonly \
  --standalone \
  --non-interactive \
  --agree-tos \
  --email "$EMAIL" \
  -d "$DOMAIN" \
  -d "www.$DOMAIN"

echo "✅ Certificado SSL obtenido en /etc/letsencrypt/live/$DOMAIN/"

# ─── 3. Configurar renovación automática ──────────────────────
echo "🔄 Configurando renovación automática del certificado..."
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --deploy-hook 'docker compose -f $APP_DIR/docker-compose.prod.yml restart web'") | crontab -

# ─── 4. Copiar archivos de la app ─────────────────────────────
echo "📁 Copiando archivos de la app..."
mkdir -p $APP_DIR
cp -r . $APP_DIR/
cd $APP_DIR

# ─── 5. Configurar variables de entorno de producción ─────────
echo "⚙️  Configurando variables de entorno..."
cat > $APP_DIR/.env << EOF
# Database
POSTGRES_USER=panelium
POSTGRES_PASSWORD=$(openssl rand -hex 24)
POSTGRES_DB=panelium

# Redis
REDIS_URL=redis://redis:6379

# API
PORT=4000
JWT_SECRET=$(openssl rand -hex 48)

# Frontend
VITE_API_URL=https://$DOMAIN
EOF

echo "✅ Variables de entorno configuradas en $APP_DIR/.env"

# ─── 6. Build y arranque con Docker Compose ───────────────────
echo "🐳 Construyendo y arrancando contenedores..."
docker compose -f docker-compose.prod.yml down 2>/dev/null || true
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

# ─── 7. Esperar que los servicios estén listos ─────────────────
echo "⏳ Esperando que los servicios estén listos..."
sleep 10

# ─── 8. Verificar estado ──────────────────────────────────────
echo "🔍 Verificando estado de los servicios..."
docker compose -f docker-compose.prod.yml ps

# ─── 9. Prueba de salud ───────────────────────────────────────
echo "❤️  Verificando health check..."
curl -sf https://$DOMAIN/health && echo "✅ API respondiendo correctamente" || echo "⚠️  API aún iniciando..."

echo ""
echo "═══════════════════════════════════════════════════"
echo "✅ ¡Despliegue completado!"
echo "   🌐 URL: https://$DOMAIN"
echo "   🔐 SSL: Let's Encrypt (válido 90 días, se renueva solo)"
echo "   📊 Ver logs: docker compose -f docker-compose.prod.yml logs -f"
echo "═══════════════════════════════════════════════════"
