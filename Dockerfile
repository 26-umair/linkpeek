FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       imagemagick libheif1 libwebp7 libraw20 dcraw librsvg2-2 ghostscript ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && printf '#!/bin/sh\ncase "$1" in identify|compare) cmd="$1"; shift; exec "$cmd" "$@";; -version) exec convert -version;; *) exec convert "$@";; esac\n' > /usr/local/bin/magick \
    && chmod +x /usr/local/bin/magick

COPY app.tar.gz.b64 /tmp/app.tar.gz.b64
RUN base64 -d /tmp/app.tar.gz.b64 | tar -xz -C /app \
    && rm -f /tmp/app.tar.gz.b64 \
    && mkdir -p /app/temp

ENV PORT=10000
EXPOSE 10000
CMD ["node", "src/server.js"]
