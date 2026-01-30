"""
Chess board detection from images using OpenCV
"""
# Disable OpenCV GUI to prevent hanging on Windows
import os
os.environ['QT_QPA_PLATFORM'] = 'offscreen'

import cv2
import numpy as np
import chess
import base64
from pathlib import Path
from pathlib import Path
import urllib.request
import ssl
from PIL import Image


class BoardDetector:
    """Detects chess board from images and extracts piece positions"""
    
    @staticmethod
    def process_image(image_data):
        """
        Process image data and extract board information
        """
        debug_data = None
        try:
            # Read image
            nparr = np.frombuffer(image_data, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if img is None:
                return {'error': 'Could not read image file'}
            
            # Detect board boundaries
            board_coords = BoardDetector._detect_board(img)
            if board_coords is None:
                return {'error': 'Could not detect chess board in image'}
            
            # Crop board region
            board_img = BoardDetector._crop_board(img, board_coords)
            
            # Detect pieces and generate FEN
            fen, debug_data = BoardDetector._detect_pieces(board_img)
            
            # Validate the FEN
            if not BoardDetector.verify_fen(fen):
                return {
                    'error': 'Could not reliably detect pieces from image. Please use FEN entry instead.',
                    'fen': fen,
                    'message': 'Board detected but piece recognition needs improvement',
                    'debug_data': debug_data
                }
            
            return {
                'error': None,
                'fen': fen,
                'message': 'Board detected successfully',
                'debug_data': debug_data
            }
        
        except Exception as e:
            import traceback
            traceback.print_exc()
            return {'error': f'Image processing failed: {str(e)}', 'debug_data': debug_data}
    
    @staticmethod
    def _detect_board(img):
        """Detect chess board in the image"""
        try:
            if len(img.shape) == 3:
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            else:
                gray = img
            
            h, w = gray.shape
            
            # Apply edge detection
            edges = cv2.Canny(gray, 30, 150)
            
            # Dilate to connect broken lines
            kernel = np.ones((3,3), np.uint8)
            edges = cv2.dilate(edges, kernel, iterations=1)
            
            # Find contours
            contours, _ = cv2.findContours(edges, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
            
            # Find the largest quadrilateral (likely the board)
            candidates = []
            
            for contour in contours:
                area = cv2.contourArea(contour)
                if area > (w * h * 0.25):  # At least 25% of image
                    epsilon = 0.02 * cv2.arcLength(contour, True)
                    approx = cv2.approxPolyDP(contour, epsilon, True)
                    
                    if len(approx) == 4:
                        x, y, w_rect, h_rect = cv2.boundingRect(approx)
                        aspect_ratio = float(w_rect) / h_rect
                        
                        if 0.8 < aspect_ratio < 1.2:
                            candidates.append((area, approx))
            
            # Sort by area descending
            candidates.sort(key=lambda x: x[0], reverse=True)
            
            if candidates:
                largest_area, largest_contour = candidates[0]
                
                # Check if largest is image border
                x, y, w_rect, h_rect = cv2.boundingRect(largest_contour)
                is_image_border = (w_rect > w * 0.95) and (h_rect > h * 0.95)
                
                # If it's the border, check if we have a smaller inner board
                if is_image_border and len(candidates) > 1:
                    second_area, second_contour = candidates[1]
                    if second_area > (w * h * 0.5):
                        return second_contour
                
                # If it's the border and no inner board, return full image corners
                if is_image_border:
                    return np.array([[0, 0], [w, 0], [w, h], [0, h]], dtype=np.int32)
                
                return largest_contour
            
            # Fallback: return full image corners
            return np.array([[0, 0], [w, 0], [w, h], [0, h]], dtype=np.int32)
        
        except Exception as e:
            print(f"Board detection error: {e}")
            return None
    
    @staticmethod
    def _crop_board(img, board_coords):
        """Crop the board from the image"""
        # Get perspective transform to make board square
        pts1 = np.float32(board_coords).reshape(4, 2)
        
        # Sort points: top-left, top-right, bottom-right, bottom-left
        s = pts1.sum(axis=1)
        rect = np.zeros((4, 2), dtype="float32")
        rect[0] = pts1[np.argmin(s)]
        rect[2] = pts1[np.argmax(s)]
        
        diff = np.diff(pts1, axis=1)
        rect[1] = pts1[np.argmin(diff)]
        rect[3] = pts1[np.argmax(diff)]
        
        pts2 = np.float32([[0, 0], [800, 0], [800, 800], [0, 800]])
        
        matrix = cv2.getPerspectiveTransform(rect, pts2)
        warped = cv2.warpPerspective(img, matrix, (800, 800))
        
        return warped

    @staticmethod
    def _img_to_base64(img):
        if img is None or img.size == 0:
            return ""
        success, buffer = cv2.imencode('.png', img)
        if not success:
            return ""
        return base64.b64encode(buffer).decode('utf-8')

    # Cache templates after first load
    _templates = None

    @staticmethod
    def _load_templates(template_dir=None):
        """
        Load piece templates and convert them to normalized binary shapes (32x32).
        """
        if BoardDetector._templates is not None:
            return BoardDetector._templates

        # We only need shapes for P, N, B, R, Q, K (using white pieces as reference)
        mapping = {
            'w_pawn': 'p', 'w_knight': 'n', 'w_bishop': 'b', 
            'w_rook': 'r', 'w_queen': 'q', 'w_king': 'k',
            'lichess_w_pawn': 'p', 'lichess_w_knight': 'n', 'lichess_w_bishop': 'b',
            'lichess_w_rook': 'r', 'lichess_w_queen': 'q', 'lichess_w_king': 'k'
        }

        templates = {}
        base = template_dir or os.path.join(os.path.dirname(__file__), 'static', 'piece_templates')
        Path(base).mkdir(parents=True, exist_ok=True)

        # Check if templates exist, if not download them
        missing = False
        for name in mapping.keys():
            if not (os.path.exists(os.path.join(base, f"{name}.png")) and 
                    os.path.exists(os.path.join(base, f"{name}_mask.png"))):
                missing = True
                break
        
        if missing:
            BoardDetector._download_templates(base)

        for name, char in mapping.items():
            path_png = os.path.join(base, f"{name}.png")
            path_mask = os.path.join(base, f"{name}_mask.png")
            
            thresh = None
            
            # Try to load mask first
            if os.path.isfile(path_mask):
                mask = cv2.imread(path_mask, cv2.IMREAD_GRAYSCALE)
                if mask is not None:
                    _, thresh = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)
            
            # Fallback to generating mask from image
            if thresh is None and os.path.isfile(path_png):
                img = cv2.imread(path_png, cv2.IMREAD_GRAYSCALE)
                if img is not None:
                    _, thresh = cv2.threshold(img, 150, 255, cv2.THRESH_BINARY)
            
            if thresh is not None:
                # Use findNonZero to get bounding box of all content
                points = cv2.findNonZero(thresh)
                if points is not None:
                    x, y, w, h = cv2.boundingRect(points)
                    
                    # Add padding to avoid cutting off edges
                    pad = 4
                    y1 = max(0, y - pad)
                    y2 = min(thresh.shape[0], y + h + pad)
                    x1 = max(0, x - pad)
                    x2 = min(thresh.shape[1], x + w + pad)
                    
                    roi = thresh[y1:y2, x1:x2]
                    # Resize to standard 32x32 for comparison
                    normalized = cv2.resize(roi, (32, 32), interpolation=cv2.INTER_AREA)
                    # Ensure binary
                    _, normalized = cv2.threshold(normalized, 127, 255, cv2.THRESH_BINARY)
                    if char not in templates:
                        templates[char] = []
                    templates[char].append(normalized)

        BoardDetector._templates = templates if templates else None
        return BoardDetector._templates
    
    @staticmethod
    def _download_templates(template_dir):
        """Download and prepare templates"""
        base_url = "https://images.chesscomfiles.com/chess-themes/pieces/neo/150/"
        # We only need white pieces for shape templates
        piece_codes = {
            'w_pawn': 'wp', 'w_knight': 'wn', 'w_bishop': 'wb', 'w_rook': 'wr', 'w_queen': 'wq', 'w_king': 'wk',
            'lichess_w_pawn': 'wp', 'lichess_w_knight': 'wn', 'lichess_w_bishop': 'wb', 'lichess_w_rook': 'wr', 'lichess_w_queen': 'wq', 'lichess_w_king': 'wk'
        }
        
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))
        opener.addheaders = [('User-agent', 'Mozilla/5.0')]
        urllib.request.install_opener(opener)

        for filename, code in piece_codes.items():
            try:
                if filename.startswith('lichess'):
                    # Use 'classic' theme which is very close to standard lichess/cburnett
                    url = f"https://images.chesscomfiles.com/chess-themes/pieces/classic/150/{code}.png"
                else:
                    url = f"{base_url}{code}.png"
                    
                temp_path = os.path.join(template_dir, "temp.png")
                urllib.request.urlretrieve(url, temp_path)
                
                img = Image.open(temp_path).convert("RGBA")
                
                # Save mask
                img.getchannel('A').save(os.path.join(template_dir, f"{filename}_mask.png"))
                
                # Save grayscale
                bg = Image.new("RGBA", img.size, (127, 127, 127, 255))
                Image.alpha_composite(bg, img).convert("L").save(os.path.join(template_dir, f"{filename}.png"))
                
                if os.path.exists(temp_path): os.remove(temp_path)
            except Exception as e:
                print(f"Failed to download {filename}: {e}")

    @staticmethod
    def _detect_pieces(board_img):
        """
        Detect pieces using Shape IoU (Intersection over Union).
        """
        templates = BoardDetector._load_templates()
        h, w = board_img.shape[:2]
        square_size = w // 8
        board_state = [[None for _ in range(8)] for _ in range(8)]
        debug_data = []

        for rank in range(8):
            for file in range(8):
                y_start = rank * square_size
                y_end = (rank + 1) * square_size
                x_start = file * square_size
                x_end = (file + 1) * square_size

                # Crop square - remove margin to ensure we don't cut off pieces
                margin = 0
                square = board_img[y_start+margin:y_end-margin, x_start+margin:x_end-margin]
                
                detected_piece, square_debug_info = BoardDetector._analyze_square(square, templates)
                board_state[rank][file] = detected_piece

                # Add square coordinate to debug info and append
                square_debug_info['square'] = f"{chr(97+file)}{8-rank}"
                debug_data.append(square_debug_info)

        board_state = BoardDetector._post_process_board_state(board_state)
        fen = BoardDetector._board_to_fen(board_state)
        return fen, debug_data
    
    @staticmethod
    def _analyze_square(square_img, templates):
        """
        Analyze a single square using Shape IoU matching.
        """
        try:
            # Trim 5% from edges to remove grid lines/borders
            h_full, w_full = square_img.shape[:2]
            trim_h = int(h_full * 0.05)
            trim_w = int(w_full * 0.05)
            if trim_h > 0 and trim_w > 0:
                square_img_trimmed = square_img[trim_h:h_full-trim_h, trim_w:w_full-trim_w]
            else:
                square_img_trimmed = square_img

            gray = cv2.cvtColor(square_img_trimmed, cv2.COLOR_BGR2GRAY)
            h, w = gray.shape
            
            # Define empty debug info for early exit
            empty_debug_info = {
                'board_img': BoardDetector._img_to_base64(square_img_trimmed),
                'binary_img': "",
                'comparisons': [],
                'template_img': "",
                'score': 0.0,
                'piece': "Empty"
            }

            # 1. Check for empty square using standard deviation.
            # If pixel intensity variation is very low, the square is empty.
            # This is more robust than edge detection for low-contrast squares.
            if np.std(gray) < 12:
                return None, empty_debug_info

            # 2. Extract Piece Mask using Canny Edge Detection
            # This gives more control over feature preservation than Otsu.
            blurred = cv2.GaussianBlur(gray, (3, 3), 0)
            edges = cv2.Canny(blurred, 30, 150) # Use a wider range for Canny
            
            # Dilate the edges to connect them into a single outline
            kernel = np.ones((3,3), np.uint8)
            dilated = cv2.dilate(edges, kernel, iterations=1)
            
            # Find contours
            contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            largest = None
            if contours:
                # Find the largest valid contour (piece)
                # Must be > 5% area (noise) and < 95% area (grid/border)
                max_area = 0
                for cnt in contours:
                    area = cv2.contourArea(cnt)
                    if area > max_area and area > (h * w * 0.05) and area < (h * w * 0.95):
                        max_area = area
                        largest = cnt
            
            # Initialize binary image as black if no piece found yet
            target_binary = np.zeros((32, 32), dtype=np.uint8)
            filled_mask = np.zeros_like(gray)

            if largest is not None:
                # Create filled mask for the piece
                cv2.drawContours(filled_mask, [largest], -1, 255, -1)
                
                # 3. Normalize Shape for Matching
                x, y, w_rect, h_rect = cv2.boundingRect(largest)
                
                # Add padding to avoid cutting off edges
                pad = 4
                y1 = max(0, y - pad)
                y2 = min(filled_mask.shape[0], y + h_rect + pad)
                x1 = max(0, x - pad)
                x2 = min(filled_mask.shape[1], x + w_rect + pad)
                
                roi = filled_mask[y1:y2, x1:x2]
                
                # Resize to 32x32 to match templates
                target_shape = cv2.resize(roi, (32, 32), interpolation=cv2.INTER_AREA)
                _, target_binary = cv2.threshold(target_shape, 127, 255, cv2.THRESH_BINARY)
            
            # 4. Compare with Templates using IoU (Intersection over Union)
            best_iou = 0.0
            best_char = None
            best_template_binary = None
            comparisons = []
            
            if templates:
                for char, tpl_list in templates.items():
                    for tpl_binary in tpl_list:
                        # Calculate IoU
                        intersection = cv2.bitwise_and(target_binary, tpl_binary)
                        union = cv2.bitwise_or(target_binary, tpl_binary)
                        
                        iou = cv2.countNonZero(intersection) / cv2.countNonZero(union) if cv2.countNonZero(union) > 0 else 0
                        
                        # Calculate IoU with inverted template
                        tpl_inv = cv2.bitwise_not(tpl_binary)
                        intersection_inv = cv2.bitwise_and(target_binary, tpl_inv)
                        union_inv = cv2.bitwise_or(target_binary, tpl_inv)
                        iou_inv = cv2.countNonZero(intersection_inv) / cv2.countNonZero(union_inv) if cv2.countNonZero(union_inv) > 0 else 0
                        
                        comparisons.append({
                            'char': char, 
                            'score': float(iou),
                            'template_base64': BoardDetector._img_to_base64(tpl_binary)
                        })

                        comparisons.append({
                            'char': f"{char} (inv)", 
                            'score': float(iou_inv),
                            'template_base64': BoardDetector._img_to_base64(tpl_inv)
                        })
                        
                        final_iou = max(iou, iou_inv)
                        
                        if final_iou > best_iou:
                            best_iou = final_iou
                            best_char = char
                            best_template_binary = tpl_binary if iou >= iou_inv else tpl_inv
            
            # 6. Final Decision
            detected_piece = None
            piece_type = None

            # Only consider it a piece if a contour was found and IoU is high enough
            if largest is not None and best_iou > 0.4:
                # 5. Determine Color using Histogram-based Percentile Analysis
                piece_pixels = gray[filled_mask == 255]
                bg_pixels = gray[filled_mask == 0]

                is_white = True
                p10_piece = 0  # 10th percentile (dark areas)
                p50_piece = 0  # 50th percentile (median)
                p90_piece = 0  # 90th percentile (bright areas)
                mean_bg = 0
                detected_color_desc = "Unknown"

                if len(piece_pixels) > 0:
                    p10_piece = np.percentile(piece_pixels, 10)
                    p50_piece = np.percentile(piece_pixels, 50)
                    p90_piece = np.percentile(piece_pixels, 90)

                    if len(bg_pixels) > 0:
                        mean_bg = np.mean(bg_pixels)
                        p50_bg = np.percentile(bg_pixels, 50)
                    else:
                        mean_bg = 127
                        p50_bg = 127

                    # Histogram-based color detection using percentiles
                    # This is more robust to shadows, highlights, and lighting variations

                    # Strong white piece indicators:
                    # - High median (p50 > 150) and high 10th percentile (p10 > 120)
                    # - Most of the piece is bright
                    if p50_piece > 150 and p10_piece > 120:
                        is_white = True
                        detected_color_desc = "White (Strong)"

                    # Strong black piece indicators:
                    # - Low median (p50 < 80) and low 90th percentile (p90 < 100)
                    # - Most of the piece is dark
                    elif p50_piece < 80 and p90_piece < 100:
                        is_white = False
                        detected_color_desc = "Black (Strong)"

                    # CRITICAL: Prevent misclassifying black pieces with highlights
                    # If median is very dark (< 60), it's definitely black regardless of highlights
                    elif p50_piece < 60:
                        is_white = False
                        detected_color_desc = "Black (Dark Core)"

                    # CRITICAL: Prevent misclassifying white pieces with dark shadows
                    # If median is bright (> 140), it's definitely white regardless of shadows
                    elif p50_piece > 140:
                        is_white = True
                        detected_color_desc = "White (Bright Core)"

                    # Moderate white piece:
                    # - Median is bright AND 10th percentile is reasonably bright
                    elif p50_piece > 130 and p10_piece > 80:
                        is_white = True
                        detected_color_desc = "White (Moderate)"

                    # CRITICAL: White pieces on dark squares
                    # - Very bright highlights (P90 > 230) indicate white pieces with reflections
                    # - Especially on dark squares (Bg < 120) where shadows bring down median
                    elif p90_piece > 230 and p50_bg < 120:
                        is_white = True
                        detected_color_desc = "White (Dark Sq)"

                    # Moderate black piece:
                    # - Median is moderately dark OR 10th percentile is very dark
                    # - But not if median is too bright (handled above)
                    elif p50_piece < 100 or p10_piece < 50:
                        is_white = False
                        detected_color_desc = "Black (Moderate)"

                    # Ambiguous cases - use relative comparison to background
                    else:
                        # Calculate contrast ratio using percentiles instead of means
                        piece_brightness = (p10_piece + p50_piece + p90_piece) / 3
                        bg_brightness = p50_bg

                        # If background is light (light square)
                        if bg_brightness > 140:
                            # On light squares, piece significantly darker than background = black
                            if piece_brightness < bg_brightness - 30:
                                is_white = False
                                detected_color_desc = "Black (Rel Light)"
                            else:
                                is_white = True
                                detected_color_desc = "White (Rel Light)"
                        else:  # Dark square
                            # On dark squares, piece brighter than background = white
                            if piece_brightness > bg_brightness + 20:
                                is_white = True
                                detected_color_desc = "White (Rel Dark)"
                            else:
                                # On dark squares, if piece is similar or darker = black
                                is_white = False
                                detected_color_desc = "Black (Rel Dark)"
                
                piece_type = best_char
                if piece_type:
                    detected_piece = piece_type.upper() if is_white else piece_type.lower()

            # Create debug info
            debug_info = {
                'board_img': BoardDetector._img_to_base64(square_img_trimmed),
                'binary_img': BoardDetector._img_to_base64(filled_mask),
                'comparisons': sorted(comparisons, key=lambda x: x['score'], reverse=True),
                'template_img': BoardDetector._img_to_base64(best_template_binary) if best_template_binary is not None else "",
                'score': float(best_iou),
                'piece': detected_piece if detected_piece else "Empty",
                'color_info': f"P10:{int(p10_piece)} P50:{int(p50_piece)} P90:{int(p90_piece)} Bg:{int(mean_bg)}",
                'detected_color': detected_color_desc
            }
            return detected_piece, debug_info
            
        except Exception:
            # On error, return None for piece and some empty debug info
            empty_debug = { 
                'board_img': BoardDetector._img_to_base64(square_img), 
                'binary_img': "",
                'comparisons': [], 
                'template_img': "", 
                'score': 0.0, 
                'piece': "Error" 
            }
            return None, empty_debug

    @staticmethod
    def _post_process_board_state(board_state):
        """
        Ensures the board state is plausible (e.g., only one king per side)
        before converting to FEN. This prevents 'Invalid Position' errors.
        """
        white_kings = []
        black_kings = []
        for r, rank_data in enumerate(board_state):
            for c, piece in enumerate(rank_data):
                if piece == 'K':
                    white_kings.append((r, c))
                elif piece == 'k':
                    black_kings.append((r, c))

        # If more than one white king, keep the first and demote others to Queens
        if len(white_kings) > 1:
            # Keep the first one found
            for i in range(1, len(white_kings)):
                r, c = white_kings[i]
                board_state[r][c] = 'Q' # A common misclassification for a king

        # Same for black kings
        if len(black_kings) > 1:
            for i in range(1, len(black_kings)):
                r, c = black_kings[i]
                board_state[r][c] = 'q'

        return board_state

    @staticmethod
    def _board_to_fen(board_state):
        """Convert board state (8x8 array) to FEN string"""
        fen_parts = []
        for rank in range(8):
            empty_count = 0
            rank_str = ""
            for file in range(8):
                piece = board_state[rank][file]
                if piece is None:
                    empty_count += 1
                else:
                    if empty_count > 0:
                        rank_str += str(empty_count)
                        empty_count = 0
                    rank_str += piece
            if empty_count > 0:
                rank_str += str(empty_count)
            fen_parts.append(rank_str)
        # Join ranks and add standard suffix for analysis
        return "/".join(fen_parts) + " w - - 0 1"

    @staticmethod
    def verify_fen(fen_str):
        """Verify if a FEN string is valid using the python-chess library."""
        try:
            # Just check if it parses. is_valid() is too strict for detection results
            chess.Board(fen_str)
            return True
        except (ValueError, AssertionError):
            return False
            
            # Fallback if IoU is low (shape didn't match well)
            if best_iou < 0.4:
                # Use simple height/width logic
                aspect_ratio = w_rect / h_rect
                height_ratio = h_rect / h
                
                if height_ratio < 0.6:
                    piece_type = 'p'
                elif aspect_ratio < 0.6:
                    piece_type = 'b'
                elif height_ratio > 0.85:
                    piece_type = 'q'
                else:
                    piece_type = 'n' # Safe default
            
            detected_piece = None
            if piece_type:
                detected_piece = piece_type.upper() if is_white else piece_type.lower()

            # Create debug info
            debug_info = {
                'board_img': BoardDetector._img_to_base64(square_img),
                'binary_img': BoardDetector._img_to_base64(target_binary),
                'comparisons': sorted(comparisons, key=lambda x: x['score'], reverse=True),
                'template_img': BoardDetector._img_to_base64(best_template_binary) if best_template_binary is not None else "",
                'score': float(best_iou),
                'piece': detected_piece if detected_piece else "Empty"
            }
            return detected_piece, debug_info
            
        except Exception:
            # On error, return None for piece and some empty debug info
            empty_debug = { 
                'board_img': BoardDetector._img_to_base64(square_img), 
                'binary_img': "",
                'comparisons': [], 
                'template_img': "", 
                'score': 0.0, 
                'piece': "Error" 
            }
            return None, empty_debug

    @staticmethod
    def _post_process_board_state(board_state):
        """
        Ensures the board state is plausible (e.g., only one king per side)
        before converting to FEN. This prevents 'Invalid Position' errors.
        """
        white_kings = []
        black_kings = []
        for r, rank_data in enumerate(board_state):
            for c, piece in enumerate(rank_data):
                if piece == 'K':
                    white_kings.append((r, c))
                elif piece == 'k':
                    black_kings.append((r, c))

        # If more than one white king, keep the first and demote others to Queens
        if len(white_kings) > 1:
            # Keep the first one found
            for i in range(1, len(white_kings)):
                r, c = white_kings[i]
                board_state[r][c] = 'Q' # A common misclassification for a king

        # Same for black kings
        if len(black_kings) > 1:
            for i in range(1, len(black_kings)):
                r, c = black_kings[i]
                board_state[r][c] = 'q'

        return board_state

    @staticmethod
    def _board_to_fen(board_state):
        """Convert board state (8x8 array) to FEN string"""
        fen_parts = []
        for rank in range(8):
            empty_count = 0
            rank_str = ""
            for file in range(8):
                piece = board_state[rank][file]
                if piece is None:
                    empty_count += 1
                else:
                    if empty_count > 0:
                        rank_str += str(empty_count)
                        empty_count = 0
                    rank_str += piece
            if empty_count > 0:
                rank_str += str(empty_count)
            fen_parts.append(rank_str)
        # Join ranks and add standard suffix for analysis
        return "/".join(fen_parts) + " w - - 0 1"

    @staticmethod
    def verify_fen(fen_str):
        """Verify if a FEN string is valid using the python-chess library."""
        try:
            # Just check if it parses. is_valid() is too strict for detection results
            chess.Board(fen_str)
            return True
        except (ValueError, AssertionError):
            return False

    @staticmethod
    def flip_board_perspective(fen):
        """
        Flip the board perspective from white to black (or vice versa).
        Reverses both rank order and file order within each rank.

        Args:
            fen: FEN string to flip

        Returns:
            Flipped FEN string
        """
        # Split FEN into board and metadata
        parts = fen.split(' ')
        board = parts[0]
        metadata = ' '.join(parts[1:]) if len(parts) > 1 else 'w - - 0 1'

        # Split board into ranks and reverse order
        ranks = board.split('/')
        ranks = ranks[::-1]

        # Reverse file order within each rank
        flipped_ranks = [rank[::-1] for rank in ranks]

        # Reconstruct FEN
        flipped_board = '/'.join(flipped_ranks)
        return f"{flipped_board} {metadata}"

    @staticmethod
    def flip_debug_data_perspective(debug_data):
        """
        Flip the square labels in debug data to match black's perspective.
        Converts coordinates like a1->h8, b2->g7, etc.

        Args:
            debug_data: List of debug info dictionaries with 'square' keys

        Returns:
            Modified debug_data with flipped square labels
        """
        if not debug_data:
            return debug_data

        for square_info in debug_data:
            if 'square' in square_info:
                original_square = square_info['square']
                # Extract file (letter) and rank (number)
                file_char = original_square[0]
                rank_char = original_square[1]

                # Flip file: a->h, b->g, c->f, d->e, e->d, f->c, g->b, h->a
                file_index = ord(file_char) - ord('a')  # 0-7
                flipped_file_index = 7 - file_index
                flipped_file = chr(ord('a') + flipped_file_index)

                # Flip rank: 1->8, 2->7, 3->6, 4->5, 5->4, 6->3, 7->2, 8->1
                rank_num = int(rank_char)  # 1-8
                flipped_rank = 9 - rank_num

                square_info['square'] = f"{flipped_file}{flipped_rank}"

        return debug_data
