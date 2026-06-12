FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/pms-service ./services/pms-service
COPY packages ./packages
RUN pnpm install --frozen-lockfile
WORKDIR /app/services/pms-service
RUN pnpm build
EXPOSE 3008
CMD ["node", "dist/server.js"]