# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/dist ./dist
COPY scripts/serve.mjs ./scripts/serve.mjs
RUN echo '{"type":"module"}' > package.json
EXPOSE 8080
USER node
CMD ["node", "scripts/serve.mjs"]
