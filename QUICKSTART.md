# Quick Start Guide - Chess Board Analyzer

## 1️⃣ Install Python

If you don't have Python installed:
1. Visit https://www.python.org/downloads/
2. Download Python 3.10 or higher
3. **During installation, check "Add Python to PATH"**

Verify installation:
```
python --version
```

## 2️⃣ Install Stockfish Chess Engine

1. Download from: https://stockfishchess.org/download/
2. For Windows: Extract the ZIP file
3. Copy the `stockfish.exe` file to `C:\Program Files\stockfish\` (or any convenient location)

## 3️⃣ Install Dependencies

Open a terminal/PowerShell and run:

```
cd path/to/chess-analyzer
python -m pip install -r requirements.txt
```

This installs:
- Flask (web server)
- python-chess (chess logic)
- opencv-python (image processing)
- stockfish (engine wrapper)

## 4️⃣ Run the Application

```
python run.py
```

You should see:
```
Running on http://localhost:5000
```

The application automatically opens in your browser!

## 5️⃣ How to Use

### Test with FEN (Easiest - No Setup Needed)
1. Click "Enter FEN" tab
2. Click "Load Starting Position"
3. Choose White or Black
4. Click "Analyze Board"
5. See the recommended move!

### Use with Screenshots
1. Take a chess board screenshot
2. Click "Upload Image" tab
3. Drag image or click "Choose Image"
4. Select side to move
5. Click "Analyze Board"

## Example FEN Strings to Test

Paste these in the FEN tab to test:

- **Starting Position**: 
  ```
  rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
  ```

- **Scholar's Mate Setup**:
  ```
  rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1
  ```

- **Endgame Example**:
  ```
  8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1
  ```

## Features

✅ **Real-time Analysis** - Get best moves instantly  
✅ **Visual Board Upload** - Analyze chess board photos  
✅ **Manual FEN Input** - Enter any position manually  
✅ **Engine Strength** - Powered by Stockfish (top chess engine)  
✅ **Multiple Move Suggestions** - See top legal moves  
✅ **Position Evaluation** - Shows position assessment  

## Keyboard Shortcuts

- No special shortcuts needed - just use the web interface!

## Troubleshooting

### "python: command not found"
- Python not in PATH
- Solution: Reinstall Python, check "Add to PATH"

### "ModuleNotFoundError"
- Dependencies not installed
- Solution: Run `python -m pip install -r requirements.txt`

### "Port already in use"
- Another app using port 5000
- Solution: Edit `run.py`, change `port=5000` to `port=5001`

### Application doesn't start
1. Check Python installation: `python --version`
2. Install dependencies: `python -m pip install -r requirements.txt`
3. Verify Stockfish path in `app/chess_engine.py` if needed

## Next Steps

- Create an opening book for suggested openings
- Add game import (PGN files)
- Improve image detection with ML models
- Add move history replay
- Export analysis results

## Support

Refer to [SETUP.md](SETUP.md) for detailed setup instructions or [README.md](README.md) for full documentation.

---

**Happy analyzing! ♟️**
