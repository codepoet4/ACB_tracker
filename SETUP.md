# Chess Board Analyzer - Setup Instructions

## Prerequisites

Make sure you have the following installed:

1. **Python 3.8 or higher**
   - Download from: https://www.python.org/downloads/
   - During installation, **CHECK THE BOX** "Add Python to PATH"

2. **Stockfish Chess Engine**
   - Download from: https://stockfishchess.org/download/
   - For Windows: Extract the .exe file to a convenient location
   - Note the path to stockfish.exe

## Installation Steps

1. **Navigate to the project directory:**
   ```
   cd path\to\chess-analyzer
   ```

2. **Create a virtual environment (recommended):**
   ```
   python -m venv venv
   venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```
   pip install -r requirements.txt
   ```

   Or if using python3:
   ```
   python3 -m pip install -r requirements.txt
   ```

4. **Update Stockfish path (if needed):**
   - Edit `app/chess_engine.py`
   - Find the line: `self.stockfish_path = stockfish_path or self._find_stockfish()`
   - If stockfish isn't found automatically, provide the full path:
     ```python
     self.stockfish_path = r'C:\path\to\stockfish.exe'
     ```

## Running the Application

1. **Activate virtual environment (if using one):**
   ```
   venv\Scripts\activate
   ```

2. **Start the application:**
   ```
   python run.py
   ```

3. **Open in browser:**
   - Navigate to: http://localhost:5000
   - The application will be running in your default browser

## Usage

### Option 1: Upload Chess Board Image
1. Take a screenshot of a chess board
2. Click "Upload Image" tab
3. Drag and drop the image or click "Choose Image"
4. Select whether to analyze for White or Black
5. Click "Analyze Board"

### Option 2: Enter FEN Notation
1. Click "Enter FEN" tab
2. Paste a FEN string (or click "Load Starting Position")
3. Select White or Black to move
4. Click "Analyze Board"

## How It Works

- **Image Detection**: The app uses OpenCV to detect chess boards from images
  - Note: Full piece detection requires training data. For testing, manually enter FEN or use the test position provided
  
- **Position Analysis**: Uses the Stockfish chess engine to find the best move
  - Automatically detects legal moves
  - Evaluates the position
  - Suggests the strongest move for the side to move

- **Move Suggestions**: Shows the UCI notation and algebraic notation for the best move

## Troubleshooting

### "Stockfish not found"
- Download Stockfish from https://stockfishchess.org/download/
- Update the path in `app/chess_engine.py`

### "Module not found" errors
- Make sure virtual environment is activated
- Run: `pip install -r requirements.txt` again
- On Windows, you might need: `python -m pip install -r requirements.txt`

### Port already in use
- Edit `run.py` and change `port=5000` to a different port (e.g., 5001)

## Testing with Examples

The application accepts FEN notation for testing. Some example positions:

- **Starting position**: `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`
- **Scholar's Mate position**: `rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1`

## Project Structure

```
chess-analyzer/
├── app/
│   ├── __init__.py           # Flask app factory
│   ├── routes.py             # API endpoints
│   ├── chess_engine.py       # Stockfish integration
│   ├── board_detector.py     # Image processing
│   ├── templates/
│   │   └── index.html        # Main webpage
│   └── static/
│       ├── css/
│       │   └── style.css     # Styling
│       └── js/
│           └── app.js        # Frontend logic
├── run.py                    # Application entry point
├── requirements.txt          # Python dependencies
└── README.md                 # Project documentation
```

## Advanced Usage

### Analyzing from Code
You can also use the analyzer programmatically:

```python
from app.chess_engine import ChessAnalyzer

analyzer = ChessAnalyzer()
result = analyzer.analyze_position(
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'white',
    depth=20
)
print(result)
analyzer.close()
```

## Support

For issues or questions:
1. Check that all prerequisites are installed
2. Ensure Stockfish is in your PATH or correctly configured
3. Verify all dependencies installed successfully
4. Check the browser console (F12) for JavaScript errors

## License

MIT - Feel free to modify and use as needed.
