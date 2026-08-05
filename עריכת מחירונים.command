#!/bin/bash
# פותח את עורך המחירונים (טיפוח + ועד עובדים) בדפדפן.
# אם השרת כבר רץ — מתחבר אליו במקום להפעיל עוד אחד.
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "========================================"
echo "   עורך המחירונים - אהרוני"
echo "========================================"

# חיפוש שרת שכבר רץ בטווח הפורטים
RUNNING_PORT=""
for port in {8080..8090}; do
    if lsof -i :$port > /dev/null 2>&1; then
        RUNNING_PORT=$port
        break
    fi
done

if [ -n "$RUNNING_PORT" ]; then
    echo "השרת כבר פועל בפורט $RUNNING_PORT — מתחבר אליו."
    open "http://localhost:$RUNNING_PORT/admin/pricelist.html?catalog=committee"
    echo ""
    echo "אפשר לסגור את החלון הזה — השרת ממשיך לרוץ בחלון השני."
    read -p "לחץ Enter לסגירה..."
    exit 0
fi

# אין שרת — מפעילים חדש
PORT=""
for port in {8080..8090}; do
    if ! lsof -i :$port > /dev/null 2>&1; then
        PORT=$port
        break
    fi
done

if [ -z "$PORT" ]; then
    echo "שגיאה: לא נמצא פורט פנוי בטווח 8080-8090."
    read -p "לחץ Enter לסגירה..."
    exit 1
fi

if ! command -v python3 &>/dev/null; then
    echo "שגיאה: python3 לא מותקן."
    read -p "לחץ Enter לסגירה..."
    exit 1
fi

export PORT=$PORT
python3 server.py &
PID=$!
sleep 1

open "http://localhost:$PORT/admin/pricelist.html?catalog=committee"

echo "========================================"
echo "   העורך נפתח בדפדפן (פורט $PORT)"
echo "   בתפריט הצד אפשר לעבור בין"
echo "   מחירון הטיפוח למחירון הוועד."
echo ""
echo "   סגירת החלון הזה מכבה את השרת."
echo "========================================"

trap "kill $PID" EXIT
wait
