#!/bin/bash

# 定义颜色和格式
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# 镜像名称和标签
IMAGE_NAME="markdown-editor"
TAG_VERSION=$(cat package.json | grep version | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | tr -d ' ')
TAG_LATEST="latest"

# 开始构建流程
echo -e "${BLUE}${BOLD}=== 开始构建 Markdown Editor 应用 ===${NC}"

# 1. 安装依赖
echo -e "${GREEN}=> 安装依赖${NC}"
npm ci || { echo -e "${RED}依赖安装失败!${NC}"; exit 1; }

# 2. 运行测试
echo -e "${GREEN}=> 运行测试${NC}"
npm test -- --watchAll=false || { echo -e "${RED}测试失败!${NC}"; exit 1; }

# 3. 构建React应用
echo -e "${GREEN}=> 构建React应用${NC}"
npm run build || { echo -e "${RED}应用构建失败!${NC}"; exit 1; }

# 4. 构建Docker镜像（使用本地已构建的静态文件）
echo -e "${GREEN}=> 构建Docker镜像: ${IMAGE_NAME}:${TAG_VERSION}${NC}"
docker build -t ${IMAGE_NAME}:${TAG_VERSION} . || { echo -e "${RED}Docker镜像构建失败!${NC}"; exit 1; }
docker tag ${IMAGE_NAME}:${TAG_VERSION} ${IMAGE_NAME}:${TAG_LATEST}

# 5. 显示构建结果
echo -e "${GREEN}${BOLD}=== 构建成功! ===${NC}"
echo -e "${BLUE}镜像信息:${NC}"
echo -e "  - ${IMAGE_NAME}:${TAG_VERSION}"
echo -e "  - ${IMAGE_NAME}:${TAG_LATEST}"

# 6. 提示如何运行
echo -e "${BLUE}${BOLD}=== 如何运行 ===${NC}"
echo -e "运行应用:"
echo -e "  ${GREEN}docker run -d -p 8080:80 ${IMAGE_NAME}:${TAG_VERSION}${NC}"
echo -e "应用将在 http://localhost:8080 上可访问"

# 提示如何推送到Docker仓库
echo -e "${BLUE}${BOLD}=== 推送到Docker仓库 ===${NC}"
echo -e "如需推送到Docker仓库，请运行:"
echo -e "  ${GREEN}docker tag ${IMAGE_NAME}:${TAG_VERSION} YOUR_REGISTRY/${IMAGE_NAME}:${TAG_VERSION}${NC}"
echo -e "  ${GREEN}docker push YOUR_REGISTRY/${IMAGE_NAME}:${TAG_VERSION}${NC}"

# 提示如何部署到Kubernetes
echo -e "${BLUE}${BOLD}=== Kubernetes部署 ===${NC}"
echo -e "如需部署到Kubernetes集群，请准备相应的k8s配置文件并运行:"
echo -e "  ${GREEN}kubectl apply -f k8s/deployment.yaml${NC}"
echo -e "  ${GREEN}kubectl apply -f k8s/service.yaml${NC}" 