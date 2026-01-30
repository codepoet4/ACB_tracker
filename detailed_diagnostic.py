"""Detailed diagnostic of what the detector finds in each square"""
import cv2
import numpy as np
from app.board_detector import BoardDetector

img_path = r'C:\Users\rparks\Code\chess-analyzer\Screenshot 2026-01-27 150015.png'

with open(img_path, 'rb') as f:
    result = BoardDetector.process_image(f.read())

print(f"Detected FEN: {result.get('fen')}")
print("\nDetailed square analysis:")

# Load and analyze manually
nparr = np.frombuffer(open(img_path, 'rb').read(), np.uint8)
img_cv = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)

board_coords = BoardDetector._detect_board(gray)
board_img = BoardDetector._crop_board(img_cv, np.array(board_coords, dtype=np.float32))

square_size = 100
for rank in range(8):
    print(f"\nRank {8-rank}:")
    for file in range(8):
        y = rank * square_size
        x = file * square_size
        square = board_img[y:y+square_size, x:x+square_size]
        
        # Get detailed metrics
        gray_sq = cv2.cvtColor(square, cv2.COLOR_BGR2GRAY)
        mean = np.mean(gray_sq)
        std = np.std(gray_sq)
        
        # Edge detection
        edges = cv2.Canny(gray_sq, 30, 100)
        edge_ratio = np.sum(edges > 0) / (square_size * square_size)
        
        # Contours
        contours, _ = cv2.findContours(edges, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        
        if len(contours) > 0:
            largest = max(contours, key=cv2.contourArea)
            area = cv2.contourArea(largest)
            perimeter = cv2.arcLength(largest, True)
            if perimeter > 0:
                circ = 4.0 * np.pi * area / (perimeter * perimeter)
            else:
                circ = 0
        else:
            area = 0
            circ = 0
        
        piece = BoardDetector._analyze_square(square)
        print(f"  {chr(97+file)}: piece={piece if piece else '.'} | mean={mean:.0f} std={std:.1f} edges={edge_ratio:.3f} area={area:.0f} circ={circ:.2f}")
