FROM node:20


RUN  mkdir /app
WORKDIR /app
RUN chown -R node:node /usr/local/lib/node_modules \
    && chown -R node:node /usr/local/bin \
    && chown -R node:node /app

USER node:node

COPY package.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY src/prisma/database-url.ts ./src/prisma/database-url.ts
RUN npm i
ADD dist/ ./dist

EXPOSE 3000

# Migrations deliberately do NOT run here. Every replica shares this image, so
# a migration in CMD runs once per pod: on an HPA scale-up each new pod blocks
# on Prisma's advisory lock behind the others, slowing exactly the scale-up
# that was needed. back-migrate-job.yaml runs them once, before the rollout.
CMD ["node", "dist/src/main"]