FROM node:22-alpine AS build
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/runner/package.json apps/runner/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/provider-adapter/package.json packages/provider-adapter/package.json
COPY packages/evidence-transport/package.json packages/evidence-transport/package.json
COPY packages/provider-openai/package.json packages/provider-openai/package.json
COPY packages/provider-deepseek/package.json packages/provider-deepseek/package.json
COPY packages/provider-anthropic/package.json packages/provider-anthropic/package.json
COPY packages/evaluation/package.json packages/evaluation/package.json
COPY packages/attestation/package.json packages/attestation/package.json
COPY packages/blob-store/package.json packages/blob-store/package.json
COPY packages/runner/package.json packages/runner/package.json
COPY packages/persistence/package.json packages/persistence/package.json
COPY packages/control-plane/package.json packages/control-plane/package.json
COPY packages/testpack-sdk/package.json packages/testpack-sdk/package.json
COPY packages/catalog-admin/package.json packages/catalog-admin/package.json

RUN npm install

COPY apps ./apps
COPY packages ./packages

RUN npm run build:backend

FROM node:22-alpine AS runtime
WORKDIR /app
ARG MODELAPSE_BUILD=dev
ENV NODE_ENV=production
ENV MODELAPSE_BUILD=$MODELAPSE_BUILD
ENV MODELAPSE_BLOB_ROOT=/var/lib/modelapse/blobs
ENV MODELAPSE_RUNNER_MODE=queue

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/runner/package.json ./apps/runner/package.json
COPY --from=build /app/apps/runner/dist ./apps/runner/dist
COPY --from=build /app/packages/domain/package.json ./packages/domain/package.json
COPY --from=build /app/packages/domain/dist ./packages/domain/dist
COPY --from=build /app/packages/provider-adapter/package.json ./packages/provider-adapter/package.json
COPY --from=build /app/packages/provider-adapter/dist ./packages/provider-adapter/dist
COPY --from=build /app/packages/evidence-transport/package.json ./packages/evidence-transport/package.json
COPY --from=build /app/packages/evidence-transport/dist ./packages/evidence-transport/dist
COPY --from=build /app/packages/provider-openai/package.json ./packages/provider-openai/package.json
COPY --from=build /app/packages/provider-openai/dist ./packages/provider-openai/dist
COPY --from=build /app/packages/provider-deepseek/package.json ./packages/provider-deepseek/package.json
COPY --from=build /app/packages/provider-deepseek/dist ./packages/provider-deepseek/dist
COPY --from=build /app/packages/evaluation/package.json ./packages/evaluation/package.json
COPY --from=build /app/packages/evaluation/dist ./packages/evaluation/dist
COPY --from=build /app/packages/attestation/package.json ./packages/attestation/package.json
COPY --from=build /app/packages/attestation/dist ./packages/attestation/dist
COPY --from=build /app/packages/blob-store/package.json ./packages/blob-store/package.json
COPY --from=build /app/packages/blob-store/dist ./packages/blob-store/dist
COPY --from=build /app/packages/runner/package.json ./packages/runner/package.json
COPY --from=build /app/packages/runner/dist ./packages/runner/dist
COPY --from=build /app/packages/persistence/package.json ./packages/persistence/package.json
COPY --from=build /app/packages/persistence/dist ./packages/persistence/dist
COPY --from=build /app/packages/control-plane/package.json ./packages/control-plane/package.json
COPY --from=build /app/packages/control-plane/dist ./packages/control-plane/dist
COPY --from=build /app/packages/testpack-sdk/package.json ./packages/testpack-sdk/package.json
COPY --from=build /app/packages/testpack-sdk/dist ./packages/testpack-sdk/dist
COPY --from=build /app/packages/catalog-admin/package.json ./packages/catalog-admin/package.json
COPY --from=build /app/packages/catalog-admin/dist ./packages/catalog-admin/dist

RUN mkdir -p /var/lib/modelapse/blobs && chown -R node:node /var/lib/modelapse

USER node

CMD ["node", "apps/runner/dist/src/index.js"]
