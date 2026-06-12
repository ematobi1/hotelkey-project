FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/bi-service ./services/bi-service
COPY packages ./packages
RUN pnpm install --frozen-lockfile
WORKDIR /app/services/bi-service
RUN pnpm build
EXPOSE 3016
CMD ["node", "dist/server.js"]