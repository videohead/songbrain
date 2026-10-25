# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./

# ---- development: hot reload, source mounted by compose ----
FROM base AS dev
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

# ---- build static assets ----
FROM base AS build
RUN npm ci
COPY . .
RUN npm run build

# ---- production: static dist + API proxy ----
FROM node:22-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm install --no-save tsx
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src ./src
VOLUME /data
EXPOSE 5173
CMD ["npx", "tsx", "server/index.ts"]
