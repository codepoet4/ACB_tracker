#!/bin/bash
# Chess Analyzer - Quick Start Script for macOS/Linux

echo "========================================"
echo "  Chess Board Analyzer - Starting App"
echo "========================================"
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python3 not found"
    echo "Please install Python from: https://www.python.org/downloads/"
    exit 1
fi

# Check if requirements are installed
python3 -c "import flask, chess, cv2, numpy, PIL, stockfish" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "Installing dependencies..."
    echo ""
    python3 -m pip install -r requirements.txt
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to install dependencies"
        exit 1
    fi
fi

echo ""
echo "Starting Chess Analyzer..."
echo "Opening http://localhost:5000 in your browser..."
echo ""

# Start the application
python3 run.py
