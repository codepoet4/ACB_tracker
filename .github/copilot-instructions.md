<!-- Chess Board Analyzer Project - Copilot Instructions -->

# Chess Board Analyzer - Development Guide

## Project Overview

A web-based application that analyzes chess board screenshots and recommends optimal moves using the Stockfish chess engine and computer vision.

## Project Structure

```
chess-analyzer/
├── app/
│   ├── __init__.py              # Flask application factory
│   ├── routes.py                # API endpoints (/api/analyze, /api/validate-fen)
│   ├── chess_engine.py          # Stockfish integration for move analysis
│   ├── board_detector.py        # OpenCV-based chess board detection
│   ├── templates/
│   │   └── index.html           # Main web interface
│   └── static/
│       ├── css/style.css        # Responsive styling
│       └── js/app.js            # Frontend logic
├── run.py                       # Application entry point
├── requirements.txt             # Python dependencies
├── README.md                    # Full documentation
├── QUICKSTART.md               # Quick setup guide
├── SETUP.md                    # Detailed setup instructions
└── .vscode/                    # VS Code configuration
    ├── launch.json             # Debug configuration
    └── tasks.json              # Build/run tasks
```

## Technology Stack

- **Backend**: Python 3.8+, Flask 2.3
- **Chess Engine**: Stockfish (UCI chess engine)
- **Chess Logic**: python-chess library
- **Image Processing**: OpenCV, NumPy
- **Frontend**: HTML5, CSS3, JavaScript (vanilla)

## Core Modules

### 1. `chess_engine.py` - ChessAnalyzer Class
- Initializes and manages Stockfish engine connection
- `analyze_position(fen, side_to_move, depth)` - Main analysis function
- Returns best move, evaluation, and legal moves
- Graceful fallback if Stockfish unavailable

### 2. `board_detector.py` - BoardDetector Class
- `process_image()` - Processes uploaded image files
- `_detect_board()` - Finds chess board using edge detection
- `_crop_board()` - Perspective transform to normalize board
- `_detect_pieces()` - Placeholder for ML-based piece detection
- `verify_fen()` - Validates FEN notation

### 3. `routes.py` - Flask Routes
- `GET /` - Serves main HTML page
- `POST /api/analyze` - Analyzes board (image or FEN)
- `POST /api/validate-fen` - Validates FEN strings
- `GET /api/starting-position` - Returns starting position FEN

### 4. `app.js` - Frontend Application
- Tab switching between Image/FEN modes
- Drag-and-drop file upload
- API communication and result display
- Loading states and error handling

## Development Workflow

### Adding New Features

1. **Backend Feature**:
   - Add method to appropriate class (ChessAnalyzer, BoardDetector)
   - Add route in `routes.py`
   - Update frontend to call new endpoint

2. **Frontend Feature**:
   - Add HTML in `index.html`
   - Add JavaScript handlers in `app.js`
   - Add styling in `style.css`

3. **Testing**:
   - Test with FEN strings first (no image processing needed)
   - Test with sample images
   - Verify Stockfish integration

### Common Tasks

**Add a new analysis parameter**:
1. Update `ChessAnalyzer.analyze_position()` signature
2. Add form field in HTML
3. Send new parameter via POST in `app.js`
4. Update API route in `routes.py`

**Improve piece detection**:
1. Modify `BoardDetector._detect_pieces()`
2. Current implementation returns starting position (placeholder)
3. Can integrate ML models here

**Adjust UI styling**:
- Edit `app/static/css/style.css`
- Uses CSS custom properties (--primary-color, etc.)
- Mobile-responsive grid layout

## Setup & Running

### Prerequisites
- Python 3.8+
- Stockfish chess engine (https://stockfishchess.org/download/)
- pip (comes with Python)

### Installation
```bash
cd chess-analyzer
python -m pip install -r requirements.txt
```

### Running
```bash
python run.py
```
Opens automatically at `http://localhost:5000`

### Debug Mode (Flask development)
```bash
python -m flask --app run run --debug
```

## Testing

### Manual Testing

1. **Test FEN Entry** (no setup needed):
   - Enter: `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`
   - Should show `e2e4` or `d2d4` as top moves

2. **Test Image Upload**:
   - Provide chess board screenshot
   - Should detect board and analyze position

3. **Test Position Evaluation**:
   - Try endgame positions
   - Verify correct side-to-move selection

### Example FEN Positions
```
Starting: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
Scholar's Mate threat: rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1
Sicilian Defense: rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 1
```

## Known Limitations

1. **Image Detection**: Currently detects board outline only
   - Piece detection requires ML model training
   - Workaround: Use manual FEN entry for testing

2. **Stockfish Path**: Requires manual configuration if not in PATH
   - See `chess_engine.py` line for manual path setting

3. **Mobile Support**: Responsive design but camera capture not implemented
   - Could add mobile camera feature in future

## Performance Considerations

- Analysis depth set to 20 (adjustable)
- Slower machines may need reduced depth
- Stockfish scales from depth 1-30+
- Image processing: ~1-2 seconds per image

## Error Handling

- Invalid FEN: Returns error message, no crash
- Missing image: Prompts user to select file
- Stockfish not found: Falls back to basic move suggestion
- Network errors: Displayed to user with context

## Deployment Notes

For production:
1. Set `debug=False` in `run.py`
2. Use production WSGI server (Gunicorn, uWSGI)
3. Add authentication if needed
4. Implement rate limiting
5. Add HTTPS with SSL certificate
6. Consider containerization (Docker)

## Future Enhancements

1. **ML-based piece detection** - Train CNN on chess pieces
2. **Game history** - PGN import and analysis replay
3. **Opening book** - Suggest known opening responses
4. **Cloud deployment** - Deploy to Heroku/AWS
5. **Mobile app** - Native iOS/Android version
6. **Real-time analysis** - Analyze during live games
7. **Move variations** - Show computer's main line
8. **Engine selection** - Support alternative engines

## Debugging Tips

**"Module not found" errors**:
- Activate virtual environment
- Reinstall requirements.txt

**Application won't start**:
- Check port 5000 not in use
- Verify Python installation
- Check file permissions

**No moves suggested**:
- Verify FEN is valid
- Check Stockfish installed
- Check Stockfish path in code

**Slow analysis**:
- Reduce depth parameter
- Check CPU usage
- Try simpler position

## Version History

- v1.0 - Initial release with image upload and FEN entry

## Contributing

To improve the application:
1. Test changes locally
2. Update documentation
3. Verify Stockfish integration
4. Test with multiple FEN positions
5. Check responsive design

---

**For quick start**: See [QUICKSTART.md](QUICKSTART.md)  
**For detailed setup**: See [SETUP.md](SETUP.md)  
**For usage**: See [README.md](README.md)
