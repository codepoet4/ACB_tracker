"""
Configuration file for Chess Analyzer
Optional - for advanced customization
"""

# ============================================
# FLASK CONFIGURATION
# ============================================

# Flask Debug Mode (set to False in production)
DEBUG = True

# Flask Host (localhost for local access)
HOST = 'localhost'

# Flask Port
PORT = 5000

# Maximum file upload size (in bytes)
# Default: 16MB
MAX_UPLOAD_SIZE = 16 * 1024 * 1024  # 16MB

# Upload folder path
UPLOAD_FOLDER = 'uploads'

# ============================================
# CHESS ENGINE CONFIGURATION
# ============================================

# Path to Stockfish executable
# If None, will search in system PATH
# Examples:
#   Windows: r'C:\Program Files\stockfish\stockfish.exe'
#   macOS: '/usr/local/bin/stockfish'
#   Linux: '/usr/bin/stockfish'
STOCKFISH_PATH = None

# Default search depth (higher = stronger but slower)
# Range: 1-30+
# Recommended: 15-25
DEFAULT_DEPTH = 20

# Engine time limit (in seconds) - alternative to depth
# None = use depth instead
ENGINE_TIME_LIMIT = None

# ============================================
# IMAGE PROCESSING CONFIGURATION
# ============================================

# Board size for perspective transform (pixels)
BOARD_SIZE = 800

# Minimum board area to detect (in pixels)
MIN_BOARD_AREA = 10000

# ============================================
# APPLICATION BEHAVIOR
# ============================================

# Number of top moves to display
TOP_MOVES_COUNT = 10

# Show position evaluation
SHOW_EVALUATION = True

# Show all legal moves
SHOW_LEGAL_MOVES = True

# Auto-refresh analysis (experimental)
AUTO_REFRESH = False

# ============================================
# SECURITY CONFIGURATION
# ============================================

# Enable CORS (for API access from other domains)
ENABLE_CORS = False

# Allowed origins for CORS
CORS_ORIGINS = ['http://localhost:3000']

# Rate limiting (requests per minute)
RATE_LIMIT = None

# ============================================
# LOGGING CONFIGURATION
# ============================================

# Log level: DEBUG, INFO, WARNING, ERROR
LOG_LEVEL = 'INFO'

# Log to file
LOG_TO_FILE = False

# Log file path
LOG_FILE = 'chess_analyzer.log'

# ============================================
# PERFORMANCE CONFIGURATION
# ============================================

# Cache analysis results
USE_CACHE = True

# Cache expiry time (in seconds)
CACHE_EXPIRY = 3600

# Number of positions to keep in cache
CACHE_SIZE = 100

# ============================================
# ADVANCED OPTIONS
# ============================================

# Enable piece detection (requires ML models)
ENABLE_PIECE_DETECTION = False

# Piece detection model path
PIECE_DETECTION_MODEL = None

# Analysis variants (number of lines to show)
ANALYSIS_VARIANTS = 1

# Multi-variation depth
MULTI_PV = 1

# ============================================
# DEPLOYMENT CONFIGURATION
# ============================================

# Production mode settings
PRODUCTION = False

# HTTPS enabled
HTTPS_ENABLED = False

# SSL certificate path
SSL_CERT = None

# SSL key path
SSL_KEY = None

# ============================================
# USAGE EXAMPLES
# ============================================

"""
To use this configuration file:

1. Import in your application:
   from config import *

2. Or use specific settings:
   import config
   depth = config.DEFAULT_DEPTH
   stockfish = config.STOCKFISH_PATH

3. For production deployment:
   Set PRODUCTION = True
   Set DEBUG = False
   Configure SSL paths if needed

4. To customize Stockfish behavior:
   Adjust DEFAULT_DEPTH (higher = stronger, slower)
   Set STOCKFISH_PATH to specific executable
   Adjust ENGINE_TIME_LIMIT for time-based analysis

5. For advanced features:
   Enable ENABLE_PIECE_DETECTION for ML-based board reading
   Use MULTI_PV for multi-line analysis
"""

# ============================================
# ENVIRONMENT-SPECIFIC OVERRIDES
# ============================================

import os

# Override from environment variables if set
if os.getenv('CHESS_DEBUG'):
    DEBUG = os.getenv('CHESS_DEBUG').lower() == 'true'

if os.getenv('CHESS_PORT'):
    PORT = int(os.getenv('CHESS_PORT'))

if os.getenv('CHESS_DEPTH'):
    DEFAULT_DEPTH = int(os.getenv('CHESS_DEPTH'))

if os.getenv('STOCKFISH_PATH'):
    STOCKFISH_PATH = os.getenv('STOCKFISH_PATH')
