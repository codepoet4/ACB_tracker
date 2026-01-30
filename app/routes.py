"""
Flask routes for the chess analyzer application
"""
from flask import Blueprint, render_template, request, jsonify
from werkzeug.utils import secure_filename
import base64
import os
from app.chess_engine import ChessAnalyzer
from app.board_detector import BoardDetector

bp = Blueprint('main', __name__)

# Initialize chess analyzer
analyzer = ChessAnalyzer()


@bp.route('/')
def index():
    """Render the main page"""
    return render_template('index.html')


@bp.route('/api/analyze', methods=['POST'])
def analyze():
    """
    API endpoint to analyze a chess board image
    
    Expected POST data:
    - image: Image file
    - fen: (optional) FEN string instead of image
    - side: 'white' or 'black'
    """
    try:
        # Check if we have FEN or image
        detected_fen = None
        if 'fen' in request.form:
            fen = request.form.get('fen')

            # Get and validate perspective parameter
            perspective = request.form.get('perspective', 'white').lower()
            if perspective not in ['white', 'black']:
                return jsonify({'error': 'Invalid perspective. Use "white" or "black"'}), 400

            # Apply perspective transformation if black
            if perspective == 'black':
                fen = BoardDetector.flip_board_perspective(fen)
        elif 'image' in request.files:
            image_file = request.files['image']
            if image_file.filename == '':
                return jsonify({'error': 'No image selected'}), 400
            
            # Process image to extract board
            result = BoardDetector.process_image(image_file.read())
            if result.get('error'):
                return jsonify(result), 400

            fen = result.get('fen')

            # Get and validate perspective parameter
            perspective = request.form.get('perspective', 'white').lower()
            if perspective not in ['white', 'black']:
                return jsonify({'error': 'Invalid perspective. Use "white" or "black"'}), 400

            debug_data = result.get('debug_data')

            # Apply perspective transformation if black
            if perspective == 'black':
                fen = BoardDetector.flip_board_perspective(fen)
                # Also flip the square labels in debug data
                if debug_data:
                    debug_data = BoardDetector.flip_debug_data_perspective(debug_data)

        else:
            return jsonify({'error': 'No image or FEN provided'}), 400

        # Get side to move
        side = request.form.get('side', 'white').lower()
        if side not in ['white', 'black']:
            return jsonify({'error': 'Invalid side. Use "white" or "black"'}), 400

        # Update FEN to reflect whose turn it is
        # FEN format: "board w/b castling en-passant halfmove fullmove"
        fen_parts = fen.split(' ')
        if len(fen_parts) >= 2:
            fen_parts[1] = 'w' if side == 'white' else 'b'
            fen = ' '.join(fen_parts)

        # Store detected FEN after updating side-to-move
        if 'image' in request.files:
            detected_fen = fen

        # Analyze the position
        analysis = analyzer.analyze_position(fen, side, depth=20)
        
        if analysis.get('error'):
            # Return error but include detected FEN if it came from image
            error_response = {'error': analysis.get('error')}
            if detected_fen:
                error_response['detected_fen'] = detected_fen
                error_response['fen'] = detected_fen  # Also include in fen field
            if 'debug_data' in locals() and debug_data:
                error_response['debug_data'] = debug_data
            return jsonify(error_response), 400
        
        response = {
            'success': True,
            'fen': fen,
            'perspective': perspective,
            'side': side,
            'best_move': analysis.get('best_move'),
            'best_move_san': analysis.get('best_move_san'),
            'evaluation': analysis.get('evaluation'),
            'legal_moves': analysis.get('all_legal_moves', [])
        }
        
        # Include detected FEN if it came from image
        if detected_fen:
            response['detected_fen'] = detected_fen
            
        if 'debug_data' in locals() and debug_data:
            response['debug_data'] = debug_data
        
        return jsonify(response)
    
    except Exception as e:
        return jsonify({'error': f'Server error: {str(e)}'}), 500


@bp.route('/api/validate-fen', methods=['POST'])
def validate_fen():
    """Validate a FEN string"""
    try:
        fen = request.json.get('fen', '')
        
        if BoardDetector.verify_fen(fen):
            return jsonify({'valid': True, 'fen': fen})
        else:
            return jsonify({'valid': False, 'error': 'Invalid FEN notation'})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/starting-position', methods=['GET'])
def starting_position():
    """Return the starting chess position"""
    return jsonify({
        'fen': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        'name': 'Starting Position'
    })


@bp.route('/api/initial-analysis', methods=['GET'])
def initial_analysis():
    """
    Analyze a default image on page load.
    """
    try:
        # Hardcoded path to the default image
        default_image_path = r"C:\Users\rparks\Code\chess-analyzer\Screenshot 2026-01-27 150015.png"
        
        if not os.path.exists(default_image_path):
            return jsonify({'error': 'Default image not found on server.'}), 404

        with open(default_image_path, 'rb') as f:
            image_data = f.read()

        # Process image to extract board
        result = BoardDetector.process_image(image_data)
        fen = result.get('fen')
        debug_data = result.get('debug_data')

        if result.get('error'):
            # Even on error, send back the image and the invalid FEN
            error_response = {
                'error': result.get('error'),
                'detected_fen': fen,
                'fen': fen,
                'image_base64': base64.b64encode(image_data).decode('utf-8'),
                'debug_data': debug_data
            }
            return jsonify(error_response), 400
        
        # Default to white's turn for initial analysis
        side = 'white'
        
        # Analyze the position
        analysis = analyzer.analyze_position(fen, side, depth=20)
        
        if analysis.get('error'):
            error_response = {'error': analysis.get('error'), 'detected_fen': fen, 'fen': fen}
            return jsonify(error_response), 400
        
        response = {
            'success': True,
            'fen': fen,
            'side': side,
            'best_move': analysis.get('best_move'),
            'best_move_san': analysis.get('best_move_san'),
            'evaluation': analysis.get('evaluation'),
            'legal_moves': analysis.get('all_legal_moves', []),
            'detected_fen': fen,
            'image_base64': base64.b64encode(image_data).decode('utf-8'),
            'debug_data': debug_data
        }
        
        return jsonify(response)
    
    except Exception as e:
        return jsonify({'error': f'Server error during initial analysis: {str(e)}'}), 500


def shutdown_session(exception=None):
    """Close chess engine on app shutdown"""
    if analyzer:
        analyzer.close()

# Register teardown handler - will be registered in app factory
bp.shutdown_session = shutdown_session
