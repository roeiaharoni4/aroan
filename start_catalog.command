#!/bin/bash
# Get the directory where this script is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "========================================"
echo "   Starting Aroam Catalog Server..."
echo "========================================"

# מחפש שרת של הפרויקט שכבר רץ. הבדיקה היא /api/ping ולא "האם הפורט תפוס",
# כי שרת שנשאר פתוח מיום קודם מגיש את הקבצים העדכניים מהדיסק אבל לא מכיר
# נתיבי API חדשים — והשמירה נכשלת עם שגיאה לא ברורה.
find_live_server() {
    for port in {8080..8090}; do
        if curl -s -m 1 "http://localhost:$port/api/ping" 2>/dev/null | grep -q '"aroam"'; then
            echo $port
            return
        fi
    done
    echo ""
}

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

# שרת תקין שכבר רץ — מתחברים אליו במקום לפתוח עוד אחד (כך לא נערמים
# שרתים ישנים שממשיכים לתפוס את הפורטים הנמוכים)
RUNNING_PORT=$(find_live_server)
if [ -n "$RUNNING_PORT" ]; then
    echo "השרת כבר פועל בפורט $RUNNING_PORT — מתחבר אליו."
    open "http://localhost:$RUNNING_PORT/catalog/"
    echo ""
    echo "אפשר לסגור את החלון הזה — השרת ממשיך לרוץ בחלון השני."
    read -p "לחץ Enter לסגירה..."
    exit 0
fi

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
    export PORT=$PORT
    python3 server.py &
    PID=$!
else
    echo "Error: Python 3 is not installed or not found in PATH."
    read -p "Press Enter to exit..."
    exit 1
fi

echo "Server started with PID: $PID"
sleep 1

# Open Browser
URL="http://localhost:$PORT/"
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

