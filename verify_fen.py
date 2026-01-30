import chess

fen = '6k1/5b2/6k1/8/1b5k/nB6/B1B1kR2/B7 w KQkq - 0 1'
print(f'Testing FEN: {fen}')

try:
    board = chess.Board(fen)
    print(f'Board created')
    print(f'is_valid(): {board.is_valid()}')
    print(f'\nBoard visualization:')
    print(board)
    print(f'\nKing positions:')
    print(f'White king: {board.king(chess.WHITE)}')
    print(f'Black king: {board.king(chess.BLACK)}')
except ValueError as e:
    print(f'ValueError: {e}')
except Exception as e:
    print(f'Error: {type(e).__name__}: {e}')
