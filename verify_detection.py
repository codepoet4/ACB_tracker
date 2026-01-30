import cv2
import numpy as np
from app.board_detector import BoardDetector

img_path = r'C:\Users\rparks\Code\chess-analyzer\Screenshot 2026-01-27 150015.png'
with open(img_path, 'rb') as f:
    img_data = f.read()

result = BoardDetector.process_image(img_data)
print(f'Detected FEN: {result.get("fen")}')
print(f'Message: {result.get("message")}')

# Manually examine the board
nparr = np.frombuffer(img_data, np.uint8)
img = cv2.imdecode(nparr, cv2.COLOR_BGR2GRAY)
board_coords = BoardDetector._detect_board(img)
board_img = BoardDetector._crop_board(cv2.imdecode(nparr, cv2.IMREAD_COLOR), board_coords)
gray_board = cv2.cvtColor(board_img, cv2.COLOR_BGR2GRAY)

square_size = 100
print('\nSquare-by-square brightness (rank 8 to rank 1, files a-h):')
for rank in range(8):
    row = []
    for file in range(8):
        y_start = rank * square_size
        y_end = (rank + 1) * square_size
        x_start = file * square_size
        x_end = (file + 1) * square_size
        square = gray_board[y_start:y_end, x_start:x_end]
        mean = np.mean(square)
        std = np.std(square)
        row.append(f'{mean:.0f}±{std:.1f}')
    print(f'Rank {8-rank}: ' + ' | '.join(row))

print('\n\nDecoded board state (using detected FEN):')
fen = result.get('fen')
if fen:
    ranks = fen.split(' ')[0].split('/')
    for i, rank_str in enumerate(ranks):
        print(f'Rank {8-i}: {rank_str}')
