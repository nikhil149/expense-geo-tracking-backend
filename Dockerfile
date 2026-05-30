# Use the official Node.js 20 Alpine Linux base image for visual and resource efficiency
FROM node:20-alpine

# Set the active working directory inside the container
WORKDIR /app

# Copy package configurations first to leverage Docker layer caching
COPY package*.json ./

# Install only production dependencies (ignoring development devDependencies like nodemon)
RUN npm ci --only=production

# Copy all remaining source files to the workspace
COPY . .

# Configure dynamic runtime environment variables
ENV NODE_ENV=production
ENV PORT=5001

# Expose the API server port
EXPOSE 5001

# Execute the Express app
CMD ["node", "server.js"]
