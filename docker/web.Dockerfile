FROM node:22-alpine AS build
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json

RUN npm install

COPY apps/web ./apps/web

ARG MODELAPSE_BUILD=dev
ENV MODELAPSE_BUILD=$MODELAPSE_BUILD

RUN npm run build -w @modelapse/web

FROM node:22-alpine AS runtime
WORKDIR /app
ARG MODELAPSE_BUILD=dev
ENV NODE_ENV=production
ENV PORT=3000
ENV MODELAPSE_BUILD=$MODELAPSE_BUILD

COPY --from=build /app/apps/web/.output ./.output

USER node
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
