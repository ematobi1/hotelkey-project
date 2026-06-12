FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/lock-service ./services/lock-service
COPY packages ./packages
RUN pnpm install --frozen-lockfile
WORKDIR /app/services/lock-service
RUN pnpm build
EXPOSE 3010
CMD ["node", "dist/server.js"]