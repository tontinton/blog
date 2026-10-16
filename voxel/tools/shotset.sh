#!/bin/sh
# Khao Sok review shot set → out/review-<tag>/ : full views, 4 yaws, clay, front/back halves, and every POI via the tour.
set -e
TAG=${1:-r1}
D=out/review-$TAG
mkdir -p $D
cd "$(dirname "$0")"
node shot.mjs /voxel/khao_sok/ --size 1600x1000 --t 3 --out $D/full.png 2>&1 | grep -iE "error|warn|voxel world|wrote" | cut -c1-600
node shot.mjs /voxel/khao_sok/ --size 1600x1000 --t 3 --views 4 --out $D/views4.png 2>&1 | grep -iE "error|wrote"
node shot.mjs /voxel/khao_sok/ --size 1200x800 --t 3 --query look=clay --out $D/clay.png 2>&1 | grep -iE "error|wrote"
mkdir -p $D/tour
node tour.mjs /voxel/khao_sok/ --size 1100x700 --wait 9000 --out $D/tour 2>&1 | tail -80 > $D/tour/labels.txt
echo done $D
