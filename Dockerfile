FROM node:22-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY public ./public
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATA_DIR=/data
RUN mkdir -p /data && chown app:app /data
USER app
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
CMD ["node", "--no-warnings=ExperimentalWarning", "server/index.js"]
