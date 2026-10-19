#!/bin/bash
N=/tmp/claude-0/-home-user-equation-i/48507962-bf52-515a-9ba7-77cb055776fc/scratchpad/release3/nrace.js; b=0; y=0; L=""
for sd in 1 2 3 4 5 6 7 8; do o=$(R=$2 TRACK=monza DIFF=ultra BOTS=21 LAPS=3 SEED=$sd OFFDBG=1 node $N 2>&1 | grep '^off'); nb=$(echo "$o" | grep -v 'off YOU' | grep -c '^off'); ny=$(echo "$o" | grep -c 'off YOU'); b=$((b+nb)); y=$((y+ny)); L="$L $(echo "$o" | grep -v 'off YOU' | awk '{print $5"@"$7}' | tr '\n' ' ')"; done
echo "$1 bot offs $b YOU offs $y | bot spots:$L"
