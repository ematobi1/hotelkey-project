FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/vault-service ./services/vault-service
COPY packages ./packages
RUN pnpm install --frozen-lockfile
WORKDIR /app/services/vault-service
RUN pnpm build
EXPOSE 3012
CMD ["node", "dist/server.js"]