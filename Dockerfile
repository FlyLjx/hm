FROM golang:1.26.4-bookworm AS build

WORKDIR /src
ARG TARGETOS=linux
ARG TARGETARCH=amd64

COPY go-server/go.mod go-server/go.sum ./go-server/
WORKDIR /src/go-server
RUN go mod download

WORKDIR /src
COPY . .
RUN rm -rf public/web public/admin \
  && mkdir -p public/web public/admin \
  && cp -a apps/web/src/. public/web/ \
  && cp -a apps/admin/src/. public/admin/
WORKDIR /src/go-server
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -ldflags "-s -w" -o /out/aipi-go ./cmd/aipi-go

FROM debian:bookworm-slim

WORKDIR /app
ENV PORT=3001 \
  SERVE_STATIC=true \
  PUBLIC_DIR=public \
  LOG_DIR=logs
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tzdata \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/logs

COPY --from=build /out/aipi-go /app/aipi-go
COPY --from=build /src/public /app/public

EXPOSE 3001

CMD ["/app/aipi-go"]
