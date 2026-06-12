FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/notification-service ./services/notification-service
COPY packages ./packages
RUN pnpm install --frozen-lockfile
WORKDIR /app/services/notification-service
RUN pnpm build
EXPOSE 3007
CMD ["node", "dist/server.js"]