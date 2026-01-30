@echo off
REM Chess Analyzer - Quick Start Script for Windows

echo.
echo ===============================================
echo   Chess Board Analyzer - Starting Application
echo ===============================================
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found in PATH
    echo.
    echo Please install Python from: https://www.python.org/downloads/
    echo Remember to check "Add Python to PATH" during installation
    echo.
    pause
    exit /b 1
)

REM Check if requirements are installed
python -c "import flask, chess, cv2, numpy, PIL, stockfish" >nul 2>&1
if errorlevel 1 (
    echo Installing dependencies...
    echo.
    python -m pip install -r requirements.txt
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

echo.
echo Starting Chess Analyzer...
echo Opening http://localhost:5000 in your browser...
echo.

REM Start the application
python run.py

REM If we get here, the app has closed
pause
