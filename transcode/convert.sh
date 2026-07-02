#!/bin/bash
# frameGrep Video Prep - HEVC/NVENC Transcoder
# Drop files in ./input, run this script, get smaller files in ./output

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT_DIR="$SCRIPT_DIR/input"
OUTPUT_DIR="$SCRIPT_DIR/output"

# NVENC settings (adjust CQ for quality: lower = better quality, larger file)
PRESET="p4"      # p1=fastest, p7=best quality
CQ="28"          # 18-28 typical range, 28 = good balance
MAX_HEIGHT="1080" # Scale down to 1080p max (saves more space)

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== frameGrep Video Prep ===${NC}"
echo "Input:  $INPUT_DIR"
echo "Output: $OUTPUT_DIR"
echo ""

# Check for input files
shopt -s nullglob
files=("$INPUT_DIR"/*.{mp4,MP4,mov,MOV,avi,AVI,mkv,MKV})
shopt -u nullglob

if [ ${#files[@]} -eq 0 ]; then
    echo -e "${YELLOW}No video files found in input folder.${NC}"
    echo "Drop .mp4/.mov/.avi/.mkv files into: $INPUT_DIR"
    exit 0
fi

echo -e "Found ${GREEN}${#files[@]}${NC} file(s) to process"
echo ""

# Process each file
count=0
for file in "${files[@]}"; do
    filename=$(basename "$file")
    name="${filename%.*}"
    output="$OUTPUT_DIR/${name}_h265.mp4"

    ((count++))
    echo -e "${YELLOW}[$count/${#files[@]}]${NC} Processing: $filename"

    # Get original file size
    orig_size=$(du -h "$file" | cut -f1)

    # Transcode with NVENC
    # -vf scale=-2:$MAX_HEIGHT scales to max height while preserving aspect ratio
    # -2 ensures width is divisible by 2 (required for most codecs)
    ffmpeg -hide_banner -loglevel warning -stats \
        -hwaccel cuda -hwaccel_output_format cuda \
        -i "$file" \
        -vf "scale_cuda=-2:'min($MAX_HEIGHT,ih)'" \
        -c:v hevc_nvenc -preset $PRESET -cq $CQ \
        -c:a aac -b:a 128k \
        -movflags +faststart \
        "$output"

    if [ $? -eq 0 ]; then
        new_size=$(du -h "$output" | cut -f1)
        echo -e "${GREEN}✓${NC} Done: $orig_size → $new_size"

        # Optionally move original to processed folder
        # mkdir -p "$INPUT_DIR/processed"
        # mv "$file" "$INPUT_DIR/processed/"
    else
        echo -e "${RED}✗${NC} Failed: $filename"
    fi
    echo ""
done

echo -e "${GREEN}=== Complete ===${NC}"
echo "Output files in: $OUTPUT_DIR"
echo ""
echo "Next: Upload the _h265.mp4 files to frameGrep"
