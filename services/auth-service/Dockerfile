FROM node:22-alpine AS builder
ENV CI=true
WORKDIR /app
RUN npm install -g pnpm && npm cache clean --force
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY services/auth-service ./services/auth-service
RUN pnpm install --frozen-lockfile \
    && pnpm --filter=@hotel-key/* build \
    && pnpm --filter=@hotel-key/auth-service build \
    && pnpm deploy --filter=@hotel-key/auth-service --prod --legacy /app/prod

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/prod .
EXPOSE 3001
CMD ["node", "dist/server.js"]
