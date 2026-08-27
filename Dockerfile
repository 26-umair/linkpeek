FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=128
ENV MAGICK_TEMPORARY_PATH=/tmp/imagemagick-cache
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       imagemagick libheif1 libwebp7 libraw20 dcraw librsvg2-2 ghostscript ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /tmp/imagemagick-cache \
    && printf '#!/bin/sh\ncase "$1" in\n  identify|compare) cmd="$1"; shift; exec "$cmd" -limit memory 96MiB -limit map 128MiB -limit disk 2GiB -limit thread 1 "$@";;\n  -version) exec convert -version;;\n  *) exec convert -limit memory 96MiB -limit map 128MiB -limit disk 2GiB -limit thread 1 "$@";;\nesac\n' > /usr/local/bin/magick \
    && chmod +x /usr/local/bin/magick

COPY cloud/package.json ./package.json
COPY cloud/src ./src
COPY cloud/public ./public
RUN mkdir -p /app/temp

ENV PORT=10000
EXPOSE 10000
CMD ["node", "src/server.js"]
