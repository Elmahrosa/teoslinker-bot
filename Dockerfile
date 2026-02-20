FROM node:20-alpine

WORKDIR /app

# Copy both package.json and lockfile for reproducible installs
COPY package.json package-lock.json* ./

# Install production deps only
RUN npm ci --omit=dev || npm install --omit=dev

# Copy app code
COPY . .

# Optional: keep data.json persistent inside container filesystem
# (Best is Koyeb volume later)
# VOLUME ["/app"]

CMD ["npm", "start"]