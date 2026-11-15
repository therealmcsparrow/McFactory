#!/bin/bash
P=$1; i=0
for cfg in "41 6 25 15" "42 13 22 12" "43 21 30 18" "44 27 24 15" "45 33 26 20" "46 39 25 10" "47 45 23 15" "48 52 28 15" "49 9 25 14" "50 17 27 16" "51 24 24 18" "52 31 26 12"; do
  i=$((i+1)); DUMP=1 timeout 120 node tm.js $P $cfg 90 > runs/b$i.txt; head -1 runs/b$i.txt | cut -c1-420
done
