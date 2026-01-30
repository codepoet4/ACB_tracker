"""Debug board detection"""
import cv2
import numpy as np
from app.board_detector import BoardDetector

img_path = r'C:\Users\rparks\Code\chess-analyzer\Screenshot 2026-01-27 150015.png'
img_cv = cv2.imread(img_path)
gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)

# Detect board
board_coords = BoardDetector._detect_board(gray)
print(f"Board coords type: {type(board_coords)}")
print(f"Board coords shape: {board_coords.shape if hasattr(board_coords, 'shape') else 'N/A'}")
print(f"Board coords: {board_coords}")

# Let's try edge detection ourselves
edges = cv2.Canny(gray, 50, 150)
print(f"Edges shape: {edges.shape}")
print(f"Non-zero edges: {np.count_nonzero(edges)}")

# Visualize the image
print(f"Image shape: {gray.shape}")
print(f"Image dtype: {gray.dtype}")
print(f"Image min/max: {gray.min()}/{gray.max()}")
