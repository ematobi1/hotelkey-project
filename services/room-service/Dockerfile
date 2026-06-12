FROM node:22-alpine AS builder
ENV CI=true
WORKDIR /app
RUN npm install -g pnpm && npm cache clean --force
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY services/room-service ./services/room-service
RUN pnpm install --frozen-lockfile \
    && pnpm --filter=@hotel-key/* build \
    && pnpm --filter=@hotel-key/room-service build \
    && pnpm deploy --filter=@hotel-key/room-service --prod --legacy /app/prod

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/prod .
EXPOSE 3004
CMD ["node", "dist/server.js"]
