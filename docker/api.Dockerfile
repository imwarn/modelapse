FROM node:22-alpine AS build
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/runner/package.json apps/runner/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/provider-adapter/package.json packages/provider-adapter/package.json
COPY packages/evidence-transport/package.json packages/evidence-transport/package.json
COPY packages/provider-openai/package.json packages/provider-openai/package.json
COPY packages/provider-anthropic/package.json packages/provider-anthropic/package.json
COPY packages/attestation/package.json packages/attestation/package.json
COPY packages/blob-store/package.json packages/blob-store/package.json
COPY packages/runner/package.json packages/runner/package.json
COPY packages/persistence/package.json packages/persistence/package.json
COPY packages/testpack-sdk/package.json packages/testpack-sdk/package.json

RUN npm install

COPY apps ./apps
COPY packages ./packages

RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/domain/package.json ./packages/domain/package.json
COPY --from=build /app/packages/domain/dist ./packages/domain/dist
COPY --from=build /app/packages/provider-adapter/package.json ./packages/provider-adapter/package.json
COPY --from=build /app/packages/provider-adapter/dist ./packages/provider-adapter/dist
COPY --from=build /app/packages/attestation/package.json ./packages/attestation/package.json
COPY --from=build /app/packages/attestation/dist ./packages/attestation/dist
COPY --from=build /app/packages/blob-store/package.json ./packages/blob-store/package.json
COPY --from=build /app/packages/blob-store/dist ./packages/blob-store/dist
COPY --from=build /app/packages/runner/package.json ./packages/runner/package.json
COPY --from=build /app/packages/runner/dist ./packages/runner/dist
COPY --from=build /app/packages/persistence/package.json ./packages/persistence/package.json
COPY --from=build /app/packages/persistence/dist ./packages/persistence/dist

USER node
EXPOSE 3000

CMD ["node", "apps/api/dist/src/index.js"]
