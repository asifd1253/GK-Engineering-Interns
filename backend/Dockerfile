FROM node:20.19.3 AS build

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:20.19.3

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=6000

COPY --from=build /usr/src/app/package*.json ./
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/certs ./certs

EXPOSE 6000

CMD ["npm", "run", "start:prod"]
