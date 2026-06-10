FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/auth-service ./services/auth-service
COPY packages ./packages
RUN pnpm install --frozen-lockfile
WORKDIR /app/services/auth-service
RUN pnpm build
EXPOSE 3001
CMD ["node", "dist/server.js"]
