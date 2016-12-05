FROM node:6-slim
MAINTAINER Kodowa, Inc. <info@kodowa.com>
ADD / /eve
RUN chown -R node:node /eve
USER node
ENV HOME /eve
WORKDIR /eve
RUN npm install
EXPOSE 8080
CMD npm start