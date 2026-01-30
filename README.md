# Chess Board Analyzer

A web application that analyzes chess board screenshots and suggests the best next move using the Stockfish chess engine.

## Features

- Upload chess board screenshots
- Automatic chess board detection using computer vision
- AI-powered move suggestions for white or black
- Real-time board analysis
- Beautiful, intuitive web interface

## Prerequisites

- Python 3.8+
- Stockfish chess engine (installed separately on your system)

## Installation

1. Clone or navigate to the project directory
2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Download and install Stockfish:
   - **Windows**: Download from https://stockfishchess.org/download/
   - **macOS**: `brew install stockfish`
   - **Linux**: `sudo apt-get install stockfish`

   After installation, make sure the stockfish executable is in your PATH or update the path in `app/chess_engine.py`

## Running the Application

```bash
python run.py
```

The application will be available at `http://localhost:5000`

## Usage

1. Take a screenshot of a chess board or upload an image
2. Select whether to analyze for White or Black
3. Click "Analyze Board"
4. The application will detect the board, analyze the position, and suggest the best move

## Project Structure

- `run.py` - Entry point for the Flask application
- `app/` - Main application directory
  - `__init__.py` - Flask app initialization
  - `routes.py` - API routes
  - `chess_engine.py` - Chess analysis with Stockfish
  - `board_detector.py` - Chessboard detection from images
  - `templates/` - HTML templates
  - `static/` - CSS and JavaScript files

## Technology Stack

- **Backend**: Flask (Python)
- **Chess Engine**: Stockfish
- **Chess Logic**: python-chess
- **Image Processing**: OpenCV, NumPy
- **Frontend**: HTML5, CSS3, JavaScript

## License

MIT
