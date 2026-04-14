FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src/ ./src/
COPY public/ ./public/
COPY scripts/ ./scripts/

EXPOSE 3456

CMD ["bun", "run", "src/server.ts"]
