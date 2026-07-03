FROM nikolaik/python-nodejs:python3.10-nodejs20-slim

WORKDIR /app

# Install Python dependencies first (better caching)
# We install torch CPU first to avoid downloading huge CUDA binaries that break free tier limits
COPY maya-ai-service/requirements.txt ./maya-ai-service/
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r maya-ai-service/requirements.txt

# Install Node dependencies
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install

# Copy the rest of the application
WORKDIR /app
COPY . .

# Set working directory to backend to run the server
WORKDIR /app/backend

EXPOSE 10000

# Start the Node.js backend
CMD ["npm", "start"]
