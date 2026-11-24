# syntax=docker/dockerfile:1.7
# Imagen del servidor AstroFact (linux/amd64 y linux/arm64). Construir desde la raíz del repo:
#   docker build -f apps/server/Dockerfile -t astrofact-server .
FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1
RUN corepack enable
WORKDIR /src
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages ./packages
COPY apps/client ./apps/client
COPY apps/server ./apps/server
COPY docs/cumplimiento ./docs/cumplimiento
COPY docs/aviso-legal.md ./docs/aviso-legal.md
COPY branding ./branding
RUN pnpm install --frozen-lockfile --filter @astrofact/server... --filter @astrofact/client...
RUN pnpm --filter @astrofact/client exec vite build --mode web \
 && pnpm --filter @astrofact/server build \
 && pnpm --filter @astrofact/server deploy --prod --legacy /out \
 && cp -r apps/server/dist /out/dist && cp -r apps/client/dist /out/web

FROM node:22-bookworm-slim
ARG VERSION=dev
LABEL org.opencontainers.image.title="AstroFact server" \
      org.opencontainers.image.description="Facturación libre autohospedada (VERI*FACTU / No VERI*FACTU)" \
      org.opencontainers.image.source="https://github.com/AstroSoftwareMoon/AstroFact" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later" \
      org.opencontainers.image.version="${VERSION}"
ENV NODE_ENV=production PORT=8080 ASTROFACT_WEB_DIR=/app/web ASTROFACT_DATA_DIR=/data ASTROFACT_VERSION=${VERSION}
WORKDIR /app
COPY --from=build --chown=node:node /out /app
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
