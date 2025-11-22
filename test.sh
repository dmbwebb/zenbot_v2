#!/bin/bash

# Function to open URL in Chrome with a fresh session
open_browser() {
    local url=$1

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        # Try to use Chrome first
        if [ -d "/Applications/Google Chrome.app" ]; then
            # Kill existing Chrome sessions if you want a completely fresh start
            # Comment out the next line if you don't want to kill existing Chrome
            # pkill -f "Google Chrome"

            # Open Chrome with a new session
            open -na "Google Chrome" --args --new-window --incognito "$url"
        else
            # Fallback to default browser
            open "$url"
        fi
    elif [[ "$OSTYPE" == "linux"* ]]; then
        # Linux
        if command -v google-chrome &>/dev/null; then
            google-chrome --new-window --incognito "$url"
        elif command -v chromium-browser &>/dev/null; then
            chromium-browser --new-window --incognito "$url"
        elif command -v xdg-open &>/dev/null; then
            xdg-open "$url"
        else
            echo "Could not detect a way to open the browser. Please open manually: $url"
        fi
    else
        echo "Unsupported OS for browser opening. Please open manually: $url"
    fi
}

# Function to kill all Python HTTP servers
kill_python_servers() {
    echo "Looking for Python HTTP servers..."

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # Find all Python processes running HTTP servers
        python_pids=$(ps aux | grep "python.*http\.server" | grep -v grep | awk '{print $2}')
        if [ ! -z "$python_pids" ]; then
            echo "Found Python HTTP server processes: $python_pids"
            echo "Killing Python processes..."
            for pid in $python_pids; do
                kill -9 $pid 2>/dev/null
                echo "Killed process $pid"
            done
        fi

        # Also check specific port
        port_pids=$(lsof -ti:8000,8001,8002,8003)
        if [ ! -z "$port_pids" ]; then
            echo "Found processes on ports 8000-8003: $port_pids"
            echo "Killing port processes..."
            for pid in $port_pids; do
                kill -9 $pid 2>/dev/null
                echo "Killed process $pid"
            done
        fi
    else
        # Linux - same as before
        python_pids=$(ps aux | grep "python.*http\.server" | grep -v grep | awk '{print $2}')
        if [ ! -z "$python_pids" ]; then
            echo "Found Python HTTP server processes: $python_pids"
            for pid in $python_pids; do
                kill -9 $pid 2>/dev/null
                echo "Killed process $pid"
            done
        fi

        for port in 8000 8001 8002 8003; do
            if fuser $port/tcp 2>/dev/null; then
                fuser -k $port/tcp 2>/dev/null
            fi
        done
    fi
}

# Function to verify port is free
verify_port_free() {
    local port=$1
    if [[ "$OSTYPE" == "darwin"* ]]; then
        lsof -i:$port >/dev/null 2>&1
        return $?
    else
        netstat -tuln | grep ":$port " >/dev/null 2>&1
        return $?
    fi
}

# Kill all potential Python servers
kill_python_servers

# Wait and verify ports are free
echo "Verifying ports are free..."
max_attempts=10
attempt=1

while [ $attempt -le $max_attempts ]; do
    ports_in_use=false
    for port in 8000 8001 8002 8003; do
        if verify_port_free $port; then
            echo "Attempt $attempt: Port $port is still in use"
            ports_in_use=true
        fi
    done

    if [ "$ports_in_use" = false ]; then
        break
    fi

    echo "Waiting for ports to be available..."
    sleep 1
    ((attempt++))

    if [ $attempt -eq $max_attempts ]; then
        echo "Trying one more aggressive kill..."
        kill_python_servers
    fi
done

if verify_port_free 8000; then
    echo "Error: Port 8000 is still in use after $max_attempts attempts"
    echo "Please manually check running processes with: lsof -i :8000"
    exit 1
fi


# Start the new server in the background
echo "Starting new server..."
python3 -m http.server 8000 &
server_pid=$!

# Wait for server to start
echo "Waiting for server to start..."
sleep 2

# Verify server started successfully
if ! ps -p $server_pid > /dev/null; then
    echo "Error: Server failed to start"
    exit 1
fi

# Print server process information
echo "New server process info:"
ps -p $server_pid -o pid,ppid,command

# Open browser to main app
echo "Opening ZenBot main app in your default browser..."
open_browser "http://localhost:8000/index.html"

echo "
ZenBot is now running!
- Main app: http://localhost:8000/index.html
- Server PID: $server_pid

Press Ctrl+C to stop the server when you're done testing.
"

# Wait for Ctrl+C and handle cleanup
trap 'echo -e "\nStopping server..."; kill -9 $server_pid 2>/dev/null; exit 0' INT TERM
wait $server_pid
