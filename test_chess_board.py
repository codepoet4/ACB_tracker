"""Test chess.Board validation"""
import chess

fen = "8/8/8/8/7P/5R1B/2QR3K/BB5R w KQkq - 0 1"
print(f"Testing FEN: {fen}")

try:
    board = chess.Board(fen)
    print(f"Board created successfully")
    print(f"is_valid(): {board.is_valid()}")
    print(f"Turn: {'white' if board.turn else 'black'}")
    print(f"Can move: {len(list(board.legal_moves)) > 0}")
except Exception as e:
    print(f"Error: {e}")
