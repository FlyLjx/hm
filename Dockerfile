FROM golang:1.26.4-bookworm AS build

WORKDIR /src
ARG TARGETOS=linux
ARG TARGETARCH=amd64
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG no_proxy
ARG GOPROXY=https://goproxy.cn,direct
ARG GOSUMDB=sum.golang.org
ENV HTTP_PROXY=$HTTP_PROXY \
  HTTPS_PROXY=$HTTPS_PROXY \
  NO_PROXY=$NO_PROXY \
  http_proxy=$http_proxy \
  https_proxy=$https_proxy \
  no_proxy=$no_proxy \
  GOPROXY=$GOPROXY \
  GOSUMDB=$GOSUMDB

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
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -ldflags "-s -w" -o /out/aipi-go ./cmd/aipi-go \
  && CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -ldflags "-s -w" -o /out/pgmigrate ./cmd/pgmigrate \
  && CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -ldflags "-s -w" -o /out/pgsmoke ./cmd/pgsmoke

FROM golang:1.26.4-bookworm AS runtime

WORKDIR /app
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG no_proxy
ENV PORT=3001 \
  SERVE_STATIC=true \
  PUBLIC_DIR=public \
  LOG_DIR=logs \
  TZ=Asia/Shanghai
RUN mkdir -p /app/logs

COPY --from=build /out/aipi-go /app/aipi-go
COPY --from=build /out/pgmigrate /app/pgmigrate
COPY --from=build /out/pgsmoke /app/pgsmoke
COPY --from=build /src/public /app/public

EXPOSE 3001

CMD ["/app/aipi-go"]
