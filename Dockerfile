# syntax=docker/dockerfile:1
FROM node:20-bookworm AS deps
WORKDIR /app

COPY client/package.json client/package.json
COPY server/package.json server/package.json

RUN cd client && npm install
RUN cd server && npm install

FROM node:20-bookworm AS build
WORKDIR /app

COPY --from=deps /app/client/node_modules client/node_modules
COPY --from=deps /app/server/node_modules server/node_modules

COPY client client
COPY server server

RUN cd client && npm run build
RUN cd server && npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY server/package.json server/package.json
RUN cd server && npm install --omit=dev

COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
COPY server/landmarks.csv server/landmarks.csv

EXPOSE 3001
CMD ["node", "server/dist/index.js"]
