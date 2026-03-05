FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./

ARG SPLUNK_RUM_TOKEN=""
ARG SPLUNK_REALM="jp0"
ARG APP_VERSION="dev"
ARG DEPLOYMENT_ENV=""
ENV VITE_SPLUNK_RUM_TOKEN=$SPLUNK_RUM_TOKEN \
    VITE_SPLUNK_REALM=$SPLUNK_REALM \
    VITE_APP_VERSION=$APP_VERSION \
    VITE_DEPLOYMENT_ENV=$DEPLOYMENT_ENV

RUN npm run build

FROM node:20-alpine AS backend-builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=backend-builder /app/dist ./dist
COPY --from=frontend-builder /app/frontend/dist ./public

EXPOSE 3000

ENV NODE_ENV=production
ENV NODE_OPTIONS="--require @splunk/otel/instrument"

CMD ["node", "dist/index.js"]
