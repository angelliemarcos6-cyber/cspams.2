FROM node:20-alpine

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the rest of the application
COPY . .

# Expose the port Render commonly uses
EXPOSE 3000

# Start the backend (change "server.js" if your main file is different)
CMD ["node", "server.js"]
