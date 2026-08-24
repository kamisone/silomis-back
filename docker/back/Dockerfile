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

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]