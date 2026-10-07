#!/bin/sh
# encerra servidores de teste que ficaram abertos
ps aux | grep "[s]erver/index" | awk '{print $2}' | xargs -r kill 2>/dev/null
sleep 0.5
