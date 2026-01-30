import sys
import json
from app.board_detector import BoardDetector

def main():
    if len(sys.argv) < 2:
        print("Usage: python tools/run_detection_on_image.py <image-path>")
        sys.exit(1)

    path = sys.argv[1]
    try:
        with open(path, 'rb') as f:
            data = f.read()
    except Exception as e:
        print(f"Could not read image: {e}")
        sys.exit(2)

    # Call detector directly
    result = BoardDetector.process_image(data)
    print(json.dumps(result, indent=2))

if __name__ == '__main__':
    main()
