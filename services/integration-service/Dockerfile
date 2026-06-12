FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/integration-service ./services/integration-service
COPY packages ./packages
RUN pnpm install --frozen-lockfile
WORKDIR /app/services/integration-service
RUN pnpm build
EXPOSE 3015
CMD ["node", "dist/server.js"]