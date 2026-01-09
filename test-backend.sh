#!/bin/bash
echo "Testing backend connection..."
echo ""

echo "1. Health check:"
curl -s http://127.0.0.1:3000/health
echo ""
echo ""

echo "2. Testing profile update:"
curl -s -X POST http://127.0.0.1:3000/v1/profile \
  -H "Content-Type: application/json" \
  -d '{"characters": [{"id": "test1", "displayName": "Test Character 1"}]}'
echo ""
echo ""

echo "3. Testing generation:"
curl -s -X POST http://127.0.0.1:3000/v1/generate \
  -H "Content-Type: application/json" \
  -d '{"force": true}' | head -20
echo ""
