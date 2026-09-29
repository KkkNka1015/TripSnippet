# TripSnippet 前端：Node 构建 → Nginx 托管静态产物
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# 浏览器直连的后端地址（构建期注入）；默认与 .env.production 占位地址一致
ARG VITE_API_BASE=https://your-tripsnippet-backend.onrender.com
ENV VITE_API_BASE=${VITE_API_BASE}
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
