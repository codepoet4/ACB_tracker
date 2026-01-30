"""Analyze the chess board image visually"""
import cv2
import numpy as np
from PIL import Image

img_path = r'C:\Users\rparks\Code\chess-analyzer\Screenshot 2026-01-27 150015.png'

# Load image
img_pil = Image.open(img_path)
img_cv = cv2.imread(img_path)
gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)

# Detect board
from app.board_detector import BoardDetector
board_coords = BoardDetector._detect_board(gray)
board_coords = np.array(board_coords, dtype=np.float32)
board_cropped = BoardDetector._crop_board(img_cv, board_coords)
board_gray = cv2.cvtColor(board_cropped, cv2.COLOR_BGR2GRAY)

# Create a visual grid of the board squares
print("Board squares brightness map (8x8):")
print("Rank 8 (top row):") 
for rank in range(8):
    row_str = f"Rank {8-rank}: "
    for file in range(8):
        y = rank * 100
        x = file * 100
        square = board_gray[y:y+100, x:x+100]
        mean = int(np.mean(square))
        # Use ASCII art to show darkness
        if mean < 100:
            char = '#'  # Dark
        elif mean < 150:
            char = '%'  # Medium-dark
        elif mean < 200:
            char = '-'  # Medium-light
        else:
            char = '.'  # Light
        row_str += f"{char}({mean:3d}) "
    print(row_str)

print("\nDetected position:")
print("Pieces found:")
board_state = []
for rank in range(8):
    rank_pieces = []
    for file in range(8):
        y = rank * 100
        x = file * 100
        square = board_cropped[y:y+100, x:x+100]
        piece = BoardDetector._analyze_square(square)
        rank_pieces.append(piece if piece else '.')
    print(f"Rank {8-rank}: {' '.join(rank_pieces)}")
    board_state.append(rank_pieces)
