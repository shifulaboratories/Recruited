# The self-hosting image, built by docker-compose.yml.
#
# It lives in docker/, not the repo root, for the reason Hired's does: Railway
# auto-detects a root Dockerfile and prefers it to railway.json's builder.
# Railway builds with Nixpacks from railway.json; this image is for compose
# and any host that runs containers.
#
# Same rules in and out of Docker: DATABASE_URL is the only setting,
# migrations run on start, and the owner account is made on first boot with
# its password printed to the log once.

# The base can be swapped for a mirror when Docker Hub rate-limits a build:
#   docker build --build-arg NODE_IMAGE=mirror.gcr.io/library/node:20-bookworm-slim …
ARG NODE_IMAGE=node:20-bookworm-slim
FROM ${NODE_IMAGE}

# openssl: Prisma's engines need it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# Dependencies first, so a source-only change doesn't reinstall them. prisma/
# comes along because postinstall runs `prisma generate`, which needs the schema.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# Uploaded files live in Postgres, so the container keeps nothing on disk.
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -p ${PORT:-3000}"]
