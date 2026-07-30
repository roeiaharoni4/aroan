#!/bin/bash
# פרסום האתר בלחיצה כפולה: מרענן את הקבצים הנגזרים, שומר ודוחף ל-GitHub.
# GitHub Pages מתעדכן תוך כמה דקות אחרי הדחיפה.
cd "$(dirname "$0")" || exit 1

echo "=================================="
echo "     פרסום האתר aroam.co.il"
echo "=================================="
echo ""

# ודא שאנחנו בתוך ריפו git
if ! git rev-parse --git-dir >/dev/null 2>&1; then
    echo "❌ התיקייה הזו אינה ריפו git — אי אפשר לפרסם מכאן."
    echo ""
    read -p "Enter ליציאה"
    exit 1
fi

# 1) רענון הקבצים הנגזרים (סכמה, פיד, דפי קטגוריה ומוצר)
echo "1/4  מרענן מבצעים, פיד וסכמה..."
if ! python3 tools/refresh_site.py; then
    echo ""
    echo "⚠️  הרענון נכשל. אפשר להמשיך ולפרסם בכל זאת, אבל ייתכן"
    echo "    שהפיד ודפי המוצר לא מעודכנים."
    read -p "להמשיך בכל זאת? (y/n) " go
    [ "$go" = "y" ] || { echo "בוטל."; read -p "Enter ליציאה"; exit 1; }
fi
echo ""

# 2) מה משתנה
echo "2/4  בודק מה השתנה..."
if [ -z "$(git status --porcelain)" ]; then
    echo ""
    echo "✅ אין שינויים לפרסום — האתר כבר מעודכן."
    echo ""
    read -p "Enter ליציאה"
    exit 0
fi
git status --short
echo ""

# 3) שמירה
echo "3/4  שומר את השינויים..."
git add -A
if ! git commit -q -m "עדכון תוכן מהעורך ($(date '+%d.%m.%Y %H:%M'))"; then
    echo "❌ השמירה נכשלה."
    read -p "Enter ליציאה"
    exit 1
fi
echo "     נשמר."
echo ""

# 4) דחיפה לאתר
echo "4/4  מעלה לאתר..."
if git push; then
    echo ""
    echo "=================================="
    echo "  ✅ פורסם! האתר יתעדכן תוך 2-3 דקות."
    echo "     https://aroam.co.il"
    echo "=================================="
else
    echo ""
    echo "❌ ההעלאה נכשלה."
    echo ""
    echo "   השינויים כן נשמרו במחשב — רק ההעלאה לא הצליחה."
    echo "   בדרך כלל זו בעיית חיבור לאינטרנט או הרשאות GitHub."
    echo "   אפשר לנסות שוב בלחיצה כפולה נוספת על הקובץ הזה."
fi

echo ""
read -p "Enter לסגירה"
