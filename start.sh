#!/bin/bash

# Kill any existing Node processes on port 3000
echo "Checking for existing processes on port 3000..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
killall -9 node 2>/dev/null

# Wait a moment for ports to be released
sleep 1

# Start the server
echo "Starting backend server..."
npm start
