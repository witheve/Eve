FROM ubuntu:16.04
MAINTAINER Kodowa, Inc. <info@kodowa.com>
ADD / /eve
RUN apt-get update && apt-get install -y \
    nodejs \
    npm
RUN ln -s /usr/bin/nodejs /usr/bin/node 
WORKDIR /eve
RUN npm install
EXPOSE 8080
CMD npm start