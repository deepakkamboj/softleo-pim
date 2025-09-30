FROM node:lts-alpine

WORKDIR /app

ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV MCP_CONFIG_DIR=/home/node/.pa-mcp

# Create logging directory with proper ownership
RUN mkdir -p /home/node/.pa-mcp && \
    chown -R node:node /home/node/.pa-mcp && \
    chmod -R 755 /home/node/.pa-mcp

RUN npm install -g npm@latest

COPY --chown=node:node package*.json ./

RUN npm ci --only=production

# Copy source files and build
COPY --chown=node:node src/ ./src/
COPY --chown=node:node tsconfig.json ./

# Install dev dependencies for build, then remove them
RUN npm ci && npm run build && npm ci --only=production

USER node

ENTRYPOINT ["npm", "run", "start"]
