FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src/ ./src/
COPY public/ ./public/
COPY scripts/ ./scripts/

# Install cloudflared
RUN apt-get update && apt-get install -y curl && \
    curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
    -o /usr/local/bin/cloudflared && \
    chmod +x /usr/local/bin/cloudflared && \
    apt-get clean

COPY start.sh ./start.sh
RUN chmod +x ./start.sh

EXPOSE 3456

CMD ["./start.sh"]
