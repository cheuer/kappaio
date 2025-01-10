FROM node:23
RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
WORKDIR /home/node/app

COPY package*.json ./
USER node
RUN npm ci

COPY --chown=node:node . .

WORKDIR /home/node/app/data
ENTRYPOINT ["node"]
CMD ["../bin/main.js"]
