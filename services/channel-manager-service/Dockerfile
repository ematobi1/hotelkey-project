FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/channel-manager-service ./services/channel-manager-service
COPY packages ./packages
RUN pnpm install --frozen-lockfile
WORKDIR /app/services/channel-manager-service
RUN pnpm build
EXPOSE 3011
CMD ["node", "dist/server.js"]