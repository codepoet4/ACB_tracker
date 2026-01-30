"""More careful analysis of the board"""
import cv2
import numpy as np
from PIL import Image

img_path = r'C:\Users\rparks\Code\chess-analyzer\Screenshot 2026-01-27 150015.png'

# Load and prepare
img_cv = cv2.imread(img_path)
img_pil = Image.open(img_path)
gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)

# Since board detection returns full image, let's scale it
# Image is 630x627, assume board is roughly square
# Find the largest mostly-square region

# Actually, let's just divide into 8x8 grid assuming full image is the board
h, w = gray.shape
square_h = h // 8
square_w = w // 8

print(f"Image: {w}x{h}, Square size: ~{square_w}x{square_h}")
print("\nDetailed analysis of each square:")
print("=" * 100)

board_analysis = []
for rank in range(8):
    rank_analysis = []
    print(f"\nRank {8-rank}:")
    for file in range(8):
        y_start = rank * square_h
        y_end = (rank + 1) * square_h
        x_start = file * square_w
        x_end = (file + 1) * square_w
        
        square_gray = gray[y_start:y_end, x_start:x_end]
        square_color = img_cv[y_start:y_end, x_start:x_end]
        
        mean_gray = np.mean(square_gray)
        std_gray = np.std(square_gray)
        
        # Check color - if BGR values differ significantly, it's colored
        mean_b = np.mean(square_color[:,:,0])
        mean_g = np.mean(square_color[:,:,1])
        mean_r = np.mean(square_color[:,:,2])
        
        # Dark vs light
        if mean_gray < 100:
            brightness = "DARK"
        elif mean_gray < 170:
            brightness = "MEDIUM"
        else:
            brightness = "LIGHT"
        
        # Color detection - look for piece colors (brown/black vs light/white)
        # Pieces might have distinct colors
        color_diff = abs(float(mean_r) - mean_b) + abs(float(mean_g) - mean_b)
        
        print(f"  File {chr(97+file)}: gray={mean_gray:.0f}±{std_gray:.1f} RGB=({mean_r:.0f},{mean_g:.0f},{mean_b:.0f}) {brightness} colordiff={color_diff:.0f}")
        rank_analysis.append({'mean': mean_gray, 'std': std_gray, 'r': mean_r, 'g': mean_g, 'b': mean_b})
    board_analysis.append(rank_analysis)

print("\n" + "=" * 100)
print("\nSummary - squares with distinct characteristics:")
for rank in range(8):
    print(f"Rank {8-rank}: ", end="")
    for file in range(8):
        sq = board_analysis[rank][file]
        if sq['std'] > 20:  # High variation = likely has a piece
            print(f"[{chr(97+file)}:var]", end=" ")
        elif sq['mean'] < 100:
            print(f"[{chr(97+file)}:dk]", end=" ")
        elif sq['mean'] > 200:
            print(f"[{chr(97+file)}:lt]", end=" ")
    print()
