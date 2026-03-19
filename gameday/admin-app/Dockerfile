ARG NODE_IMAGE="node:24-alpine"

FROM ${NODE_IMAGE} AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
COPY src/constants /app/src/constants

ARG SPLUNK_RUM_TOKEN=""
ARG SPLUNK_REALM="jp0"
ARG APP_VERSION="dev"
ARG DEPLOYMENT_ENV=""

RUN VITE_SPLUNK_RUM_TOKEN=$SPLUNK_RUM_TOKEN \
    VITE_SPLUNK_REALM=$SPLUNK_REALM \
    VITE_APP_VERSION=$APP_VERSION \
    VITE_DEPLOYMENT_ENV=$DEPLOYMENT_ENV \
    npm run build

FROM ${NODE_IMAGE} AS backend-builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM ${NODE_IMAGE} AS runtime

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=backend-builder /app/dist ./dist
COPY --from=frontend-builder /app/frontend/dist ./public

EXPOSE 3000

ENV NODE_ENV=production
ENV NODE_OPTIONS="--require @splunk/otel/instrument"

CMD ["node", "dist/index.js"]
