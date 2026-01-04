#!/bin/bash
# Get the directory where this script is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "========================================"
echo "   Starting Aroam Catalog Server..."
echo "========================================"

# Function to find an open port
find_port() {
    for port in {8080..8090}; do
        if ! lsof -i :$port > /dev/null; then
            echo $port
            return
        fi
    done
    echo "0"
}

PORT=$(find_port)

if [ "$PORT" -eq "0" ]; then
    echo "ERROR: Could not find an open port between 8080 and 8090."
    echo "Please close other applications and try again."
    read -p "Press Enter to exit..."
    exit 1
fi

echo "Found open port: $PORT"
echo "Starting server..."

# Start Python server
# Using python3 (standard on Mac)
if command -v python3 &>/dev/null; then
    python3 -m http.server $PORT &
    PID=$!
else
    echo "Error: Python 3 is not installed or not found in PATH."
    read -p "Press Enter to exit..."
    exit 1
fi

echo "Server started with PID: $PID"
sleep 1

# Open Browser
URL="http://localhost:$PORT/catalog.html"
echo "Opening $URL"
open "$URL"

echo "========================================"
echo "   Catalog is RUNNING!"
echo "   Close this window to stop."
echo "========================================"

# Cleanup on exit
trap "kill $PID" EXIT

# Wait indefinitely
wait

