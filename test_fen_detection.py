from app.board_detector import BoardDetector
import json

img_path = r'C:\Users\rparks\Code\chess-analyzer\Screenshot 2026-01-27 150015.png'
with open(img_path, 'rb') as f:
    result = BoardDetector.process_image(f.read())

print(json.dumps(result, indent=2))
print()
fen_val = result.get('fen')
print(f'FEN returned: {fen_val}')
print(f'FEN is valid: {BoardDetector.verify_fen(fen_val)}')
