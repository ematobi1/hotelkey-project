FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/webhook-service ./services/webhook-service
COPY packages ./packages
RUN pnpm install --frozen-lockfile
WORKDIR /app/services/webhook-service
RUN pnpm build
EXPOSE 3014
CMD ["node", "dist/server.js"]