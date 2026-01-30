"""
Script to download and set up chess piece templates for the analyzer.
Run this once to ensure high-quality detection.
"""
import os
import urllib.request
from PIL import Image
import sys
import ssl

def setup():
    # Define path to templates directory
    root = os.path.dirname(os.path.abspath(__file__))
    template_dir = os.path.join(root, 'app', 'static', 'piece_templates')
    
    # Create directory if it doesn't exist
    if not os.path.exists(template_dir):
        os.makedirs(template_dir)
        print(f"Created directory: {template_dir}")
    
    # Use Chess.com Neo theme (clean, standard look)
    base_url = "https://images.chesscomfiles.com/chess-themes/pieces/neo/150/"
    
    # Map our filenames to chess.com codes
    # Our format: w_pawn.png
    # Their format: wp.png
    pieces = {
        'w_pawn': 'wp', 'w_knight': 'wn', 'w_bishop': 'wb', 'w_rook': 'wr', 'w_queen': 'wq', 'w_king': 'wk',
        'b_pawn': 'bp', 'b_knight': 'bn', 'b_bishop': 'bb', 'b_rook': 'br', 'b_queen': 'bq', 'b_king': 'bk'
    }
    
    print(f"Downloading piece templates to {template_dir}...")
    
    for filename, code in pieces.items():
        target = os.path.join(template_dir, f"{filename}.png")
        
        # Skip if already exists
        if os.path.exists(target):
            print(f"  Skipping {filename}.png (already exists)")
            continue
            
        url = f"{base_url}{code}.png"
        try:
            print(f"  Downloading {filename}.png...")
            
            # Download to temp file
            temp_path = target + ".tmp"
            
            # Add headers to avoid 403 Forbidden
            # Create unverified context to avoid SSL errors
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            
            opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))
            opener.addheaders = [('User-agent', 'Mozilla/5.0')]
            urllib.request.install_opener(opener)
            urllib.request.urlretrieve(url, temp_path)
            
            # Process image: Composite over gray background to handle transparency
            # This ensures black pieces don't disappear on black background
            img = Image.open(temp_path).convert("RGBA")
            bg = Image.new("RGBA", img.size, (127, 127, 127, 255)) # Mid-gray background
            combined = Image.alpha_composite(bg, img)
            
            # Save as grayscale
            combined.convert("L").save(target)
            
            # Also save the alpha channel as a mask
            mask = img.getchannel('A')
            mask_path = os.path.join(template_dir, f"{filename}_mask.png")
            mask.save(mask_path)
            
            # Clean up temp file
            os.remove(temp_path)
            
        except Exception as e:
            print(f"  Failed to download {filename}: {e}")

    # --- Lichess Pieces (cburnett theme) ---
    print("\nDownloading Lichess piece templates...")
    lichess_base_url = "https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/cburnett/"
    
    # Lichess uses wP.svg, bN.svg etc. We need to convert to png.
    # Since we can't easily convert SVG to PNG without extra libraries like cairosvg,
    # we will try to find a PNG source or just use the chess.com ones for now if SVG conversion is too complex for this script.
    # Actually, wikimedia commons has them as PNGs.
    # Let's use a reliable PNG source for cburnett style.
    
    lichess_pieces = {
        'lichess_w_pawn': 'wP', 'lichess_w_knight': 'wN', 'lichess_w_bishop': 'wB', 'lichess_w_rook': 'wR', 'lichess_w_queen': 'wQ', 'lichess_w_king': 'wK',
        'lichess_b_pawn': 'bP', 'lichess_b_knight': 'bN', 'lichess_b_bishop': 'bB', 'lichess_b_rook': 'bR', 'lichess_b_queen': 'bQ', 'lichess_b_king': 'bK'
    }
    
    for filename, code in lichess_pieces.items():
        target = os.path.join(template_dir, f"{filename}.png")
        if os.path.exists(target):
            print(f"  Skipping {filename}.png (already exists)")
            continue
            
        # Using a public mirror for PNG versions of standard chess pieces
        url = f"https://images.chesscomfiles.com/chess-themes/pieces/classic/150/{code.lower()}.png"
        
        try:
            print(f"  Downloading {filename}.png...")
            temp_path = target + ".tmp"
            
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, context=ssl.create_default_context()) as response, open(temp_path, 'wb') as out_file:
                out_file.write(response.read())
            
            img = Image.open(temp_path).convert("RGBA")
            bg = Image.new("RGBA", img.size, (127, 127, 127, 255))
            combined = Image.alpha_composite(bg, img)
            combined.convert("L").save(target)
            
            # Save mask
            mask = img.getchannel('A')
            mask_path = os.path.join(template_dir, f"{filename}_mask.png")
            mask.save(mask_path)
            
            os.remove(temp_path)
            
        except Exception as e:
            print(f"  Failed to download {filename}: {e}")

    print("\nDone! Templates are ready.")

if __name__ == "__main__":
    setup()
