FROM node:6-slim
MAINTAINER Kodowa, Inc. <info@kodowa.com>
ADD / /eve
WORKDIR /eve
RUN npm install
EXPOSE 8080
CMD npm start