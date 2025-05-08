FROM nginx:alpine

# 复制本地已构建的静态文件到Nginx服务器
COPY build/ /usr/share/nginx/html/

# 复制Nginx配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露80端口
EXPOSE 80

# 启动Nginx服务
CMD ["nginx", "-g", "daemon off;"] 