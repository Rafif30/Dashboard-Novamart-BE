FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Tambahkan dummy DATABASE_URL hanya untuk prisma generate saat build
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

# Generate Prisma Client
RUN npx prisma generate

# Build NestJS
RUN npm run build


FROM node:20-alpine AS production

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Generate Prisma Client lagi untuk production image
RUN npx prisma generate

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]