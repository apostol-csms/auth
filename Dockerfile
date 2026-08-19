# syntax=docker/dockerfile:1.7
#
# csms-auth — OAuth2 SPA container.
#
# Built locally on the brand side (same pattern as apostol-csms/frontend).
# Vite bakes VITE_* vars into the bundle at build time, so each brand
# needs its own build with brand-specific OAuth2 client / API host /
# branding args. See the `build.args:` block in the brand's
# docker-compose.yaml.
#
# Base images come from Docker Hub by default — exactly as before. Passing
# --build-arg REGISTRY=<host>/base redirects every FROM below to a mirror, which
# is what the Russian build contour does: it must reach no registry abroad.
ARG REGISTRY=docker.io/library

FROM ${REGISTRY}/node:22-alpine AS builder

ARG VITE_API_HOST=
ARG VITE_CLIENT_ID=
ARG VITE_SCOPE=
ARG VITE_APP_TITLE=Apostol
ARG VITE_APP_LOGO=/assets/logo.svg
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_DEFAULT_LOCALE=en

ENV VITE_API_HOST=${VITE_API_HOST} \
    VITE_CLIENT_ID=${VITE_CLIENT_ID} \
    VITE_SCOPE=${VITE_SCOPE} \
    VITE_APP_TITLE=${VITE_APP_TITLE} \
    VITE_APP_LOGO=${VITE_APP_LOGO} \
    VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID} \
    VITE_DEFAULT_LOCALE=${VITE_DEFAULT_LOCALE}

WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ─────────────────────────────────────────────────────────────

FROM ${REGISTRY}/nginx:stable-alpine AS app

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000
