"""
Chess engine integration with Stockfish
"""
import chess
import chess.engine
import os
from pathlib import Path


class ChessAnalyzer:
    """Analyzes chess positions using Stockfish engine"""
    
    def __init__(self, stockfish_path=None):
        """
        Initialize the chess analyzer
        
        Args:
            stockfish_path: Path to stockfish executable. If None, searches in PATH
        """
        self.engine = None
        self.stockfish_path = stockfish_path or self._find_stockfish()
        self._engine_initialized = False
        
        if self.stockfish_path:
            try:
                self.engine = chess.engine.SimpleEngine.popen_uci(self.stockfish_path)
                self._engine_initialized = True
            except Exception as e:
                print(f"Warning: Could not load Stockfish engine: {e}")
                print("Move analysis will be limited to basic chess rules")
    
    def _find_stockfish(self):
        """Try to find stockfish executable in common locations"""
        # Common executable names
        names = ['stockfish', 'stockfish.exe', 'sf', 'sf.exe']
        
        # Try using 'which' command on Unix-like systems
        import subprocess
        import sys
        
        for name in names:
            try:
                if sys.platform == 'win32':
                    result = subprocess.run(['where', name], capture_output=True, text=True)
                else:
                    result = subprocess.run(['which', name], capture_output=True, text=True)
                
                if result.returncode == 0:
                    return result.stdout.strip().split('\n')[0]
            except:
                pass
        
        return None
    
    def analyze_position(self, fen, side_to_move, depth=20):
        """
        Analyze a chess position and return the best move
        
        Args:
            fen: FEN notation of the board position
            side_to_move: 'white' or 'black'
            depth: Search depth for the engine (default 20)
        
        Returns:
            dict with analysis results
        """
        # Reinitialize engine if it's dead
        if self.engine and self._engine_initialized:
            try:
                if self.engine.process and self.engine.process.poll() is not None:
                    # Process is dead, reinitialize
                    self.engine = None
                    self._engine_initialized = False
            except:
                pass
        
        if not self._engine_initialized and self.stockfish_path:
            try:
                self.engine = chess.engine.SimpleEngine.popen_uci(self.stockfish_path)
                self._engine_initialized = True
            except Exception as e:
                self.engine = None
                self._engine_initialized = False

        try:
            board = chess.Board(fen)
            
            # Verify the position is valid
            if not board.is_valid():
                return {
                    'error': 'Invalid chess position',
                    'best_move': None,
                    'evaluation': None
                }
            
            # Verify it's the correct side to move
            if (side_to_move.lower() == 'white' and not board.turn) or \
               (side_to_move.lower() == 'black' and board.turn):
                return {
                    'error': f'It is not {side_to_move.lower()}\'s turn to move',
                    'best_move': None,
                    'evaluation': None
                }
            
            if not self.engine:
                # Fallback: return basic moves without evaluation
                legal_moves = list(board.legal_moves)
                if legal_moves:
                    return {
                        'error': None,
                        'best_move': legal_moves[0].uci(),
                        'best_move_san': board.san(legal_moves[0]),
                        'evaluation': 'Engine not available - showing first legal move',
                        'all_legal_moves': [board.san(move) for move in legal_moves[:10]]
                    }
                else:
                    return {
                        'error': 'No legal moves available',
                        'best_move': None,
                        'evaluation': None
                    }
            
            # Use engine for analysis
            info = self.engine.analyse(board, chess.engine.Limit(depth=depth))
            best_move = info.get('pv', [None])[0]
            
            if not best_move:
                return {
                    'error': 'Could not analyze position',
                    'best_move': None,
                    'evaluation': None
                }
            
            # Format the response
            score = info.get('score')
            evaluation = None
            if score:
                # PovScore needs to be converted to absolute score
                white_score = score.white() if hasattr(score, 'white') else score

                if white_score.is_mate():
                    mate_in = white_score.mate()
                    evaluation = f"Mate in {abs(mate_in)}" if mate_in else "Mate"
                else:
                    # Convert to centipawns, positive is good for white
                    cp = white_score.score() if hasattr(white_score, 'score') else white_score.cp
                    evaluation = f"{cp/100:.2f}" if cp is not None else "Draw"
            
            return {
                'error': None,
                'best_move': best_move.uci(),
                'best_move_san': board.san(best_move),
                'evaluation': evaluation,
                'all_legal_moves': [board.san(move) for move in list(board.legal_moves)[:10]]
            }
        
        except Exception as e:
            return {
                'error': f'Analysis failed: {str(e)}',
                'best_move': None,
                'evaluation': None
            }
    
    def close(self):
        """Close the chess engine"""
        if self.engine and self._engine_initialized:
            try:
                # Only quit if the process is still alive
                if self.engine.process and not self.engine.process.poll():
                    self.engine.quit()
                self._engine_initialized = False
            except Exception:
                # Engine may already be closed or terminated, ignore the error
                self._engine_initialized = False
