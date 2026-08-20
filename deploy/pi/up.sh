#!/bin/bash
set -e

echo "Starting SentinelOps Pi deployment with Google Cloud Run..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker is not running. Please start Docker first."
  exit 1
fi

# Build and start the containers
echo "Building and starting containers..."
docker compose -f docker-compose.pi.yml up -d --build

echo ""
echo "✅ Deployment started!"
echo ""
echo "Access the dashboard at: http://192.168.1.254:8080"
echo "(Replace 192.168.1.254 with your Pi's IP address)"
echo ""
echo "The frontend is served from the Pi and proxies API calls to Cloud Run."
echo "All requests are same-origin, so no CORS issues."
echo ""
echo "To view logs: docker compose -f docker-compose.pi.yml logs -f"
echo "To stop: docker compose -f docker-compose.pi.yml down"
