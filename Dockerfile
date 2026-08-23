FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       imagemagick libheif1 libwebp7 libraw20 dcraw librsvg2-2 ghostscript ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && printf '#!/bin/sh\ncase "$1" in identify|compare) cmd="$1"; shift; exec "$cmd" "$@";; -version) exec convert -version;; *) exec convert "$@";; esac\n' > /usr/local/bin/magick \
    && chmod +x /usr/local/bin/magick

COPY bundle /tmp/bundle
RUN cat /tmp/bundle/chunk1.b64 /tmp/bundle/chunk2.b64 /tmp/bundle/chunk3.b64 /tmp/bundle/chunk4.b64 \
    | base64 -d \
    | tar -xz -C /app \
    && rm -rf /tmp/bundle \
    && mkdir -p /app/temp

ENV PORT=10000
EXPOSE 10000
CMD ["node", "src/server.js"]
