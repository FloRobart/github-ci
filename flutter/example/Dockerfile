# Web version of a Flutter application, served by nginx.
# The CI builds this file as is: the Flutter build happens inside the first stage.

#=======#
# Build #
#=======#

# Pin the same Flutter version as the CI ("flutter-version" input) for identical builds.
FROM ghcr.io/cirruslabs/flutter:stable AS build

WORKDIR /application

# Dependencies first: this layer stays cached while only the code changes.
COPY pubspec.yaml pubspec.lock ./
RUN flutter pub get

COPY . .
RUN flutter build web --release

#=======#
# Serve #
#=======#

FROM nginx:stable-alpine

# Given by the CI, for example "1.5.0" or "1.5.0-rc.2".
ARG APP_VERSION=dev
LABEL org.opencontainers.image.version="${APP_VERSION}"

COPY --from=build /application/build/web /usr/share/nginx/html
