FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/consent-service ./services/consent-service
COPY packages ./packages
RUN pnpm install --frozen-lockfile
WORKDIR /app/services/consent-service
RUN pnpm build
EXPOSE 3013
CMD ["node", "dist/server.js"]