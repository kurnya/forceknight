#!/bin/sh
echo "===== Network Connectivity Check ====="
echo "DNS resolve web.whatsapp.com:"
nslookup web.whatsapp.com 2>&1 || echo "nslookup not available"
echo ""
echo "Curl test web.whatsapp.com:"
curl -sI --connect-timeout 10 https://web.whatsapp.com 2>&1 | head -5 || echo "curl failed"
echo ""
echo "Curl test whatsapp.com:"
curl -sI --connect-timeout 10 https://www.whatsapp.com 2>&1 | head -3 || echo "curl failed"
echo ""
echo "===== Starting Bot ====="
exec node src/index.js
