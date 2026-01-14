#!/bin/bash

# Directory to optimize
TARGET_DIR="./images"

echo "Optimizing images in $TARGET_DIR..."

# Find and process images
find "$TARGET_DIR" -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" \) | while read -r img; do
    echo "Processing $img..."
    
    # Get current dimensions
    width=$(sips -g pixelWidth "$img" | tail -n 1 | awk '{print $2}')
    
    # 1. Resize if width > 800
    if [ "$width" -gt 800 ]; then
        echo "  Resizing from ${width}px to 800px..."
        sips -Z 800 "$img" --out "$img" > /dev/null
    fi

    # 2. Compress (only valid for JPG usually with sips, for PNG sips doesn't compress much without format change)
    # We will try to set quality for generic property
    if [[ "$img" == *.jpg ]] || [[ "$img" == *.jpeg ]]; then
         sips -s formatOptions 80 "$img" --out "$img" > /dev/null
    fi
    
    # Ideally for PNGs we would use pngquant, but sticking to built-in tools.
    # Reprocessing PNG with sips might help slightly or not.
    # We will skip forceful re-compression of PNGs to avoid issues, resizing is the main win.
done

echo "Optimization complete."
