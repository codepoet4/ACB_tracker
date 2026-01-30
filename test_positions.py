"""
Example chess positions for testing the analyzer
"""

TEST_POSITIONS = {
    "starting_position": {
        "name": "Starting Position",
        "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "description": "The standard starting position",
        "best_moves_white": ["e2e4", "d2d4", "c2c4", "g1f3"]
    },
    
    "italian_game": {
        "name": "Italian Game",
        "fen": "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 3",
        "description": "1.e4 e5 2.Nf3",
        "best_moves_black": ["g8f6", "d7d6", "b8c6"]
    },
    
    "sicilian_defense": {
        "name": "Sicilian Defense",
        "fen": "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 1",
        "description": "1.e4 c5 - Sicilian Defense",
        "best_moves_white": ["g1f3", "d2d4"]
    },
    
    "french_defense": {
        "name": "French Defense",
        "fen": "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
        "description": "1.e4 e6 - French Defense",
        "best_moves_white": ["d2d4", "g1f3"]
    },
    
    "caro_kann": {
        "name": "Caro-Kann Defense",
        "fen": "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2",
        "description": "1.e4 c6 - Caro-Kann Defense",
        "best_moves_white": ["d2d4", "c2c4"]
    },
    
    "scholars_mate_threat": {
        "name": "Scholar's Mate Setup",
        "fen": "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1",
        "description": "Position showing Scholar's Mate threat (White to move)",
        "best_moves_white": ["f1c4", "d1f3"]
    },
    
    "queens_gambit": {
        "name": "Queen's Gambit",
        "fen": "rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq c3 0 1",
        "description": "1.d4 d5 2.c4 - Queen's Gambit",
        "best_moves_black": ["d5c4", "d5d4", "c7c6"]
    },
    
    "ruy_lopez": {
        "name": "Ruy Lopez Opening",
        "fen": "rnbqkbnr/pppppppp/8/8/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
        "description": "1.e4 e5 2.Nf3 - Start of Ruy Lopez",
        "best_moves_black": ["g8f6", "b8c6", "d7d6"]
    },
    
    "endgame_king_pawn": {
        "name": "King and Pawn Endgame",
        "fen": "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
        "description": "Classic endgame position",
        "best_moves_white": ["c1a3", "b4h4"]
    },
    
    "endgame_rook": {
        "name": "Rook Endgame",
        "fen": "6k1/5pp1/8/8/8/8/5PPK w - - 0 1",
        "description": "King and pawn endgame",
        "best_moves_white": ["h1g2", "f2f3", "f2f4"]
    },
    
    "opposite_bishops": {
        "name": "Opposite Bishops",
        "fen": "8/1b6/8/8/8/8/1B4K1 w - - 0 1",
        "description": "Theoretical draw with opposite-colored bishops",
        "best_moves_white": ["b2a3", "b2c1"]
    },
    
    "back_rank_mate": {
        "name": "Back Rank Mate Threat",
        "fen": "rnbqkb1r/pppp1Qpp/5n2/4p3/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 0 4",
        "description": "Position with back rank mate threat",
        "best_moves_black": ["e8f8", "f6d5"]
    },
    
    "fork_tactic": {
        "name": "Knight Fork Tactic",
        "fen": "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
        "description": "Position demonstrating tactical motifs",
        "best_moves_white": ["g1f3", "d2d4"]
    },
    
    "pin_tactic": {
        "name": "Pin Tactic Example",
        "fen": "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 4 4",
        "description": "Position with potential pin",
        "best_moves_white": ["f1c4", "e1g1"]
    },
}

def get_position(position_key):
    """Get a test position by key"""
    return TEST_POSITIONS.get(position_key)

def list_positions():
    """List all available test positions"""
    return list(TEST_POSITIONS.keys())

def get_all_positions():
    """Get all test positions"""
    return TEST_POSITIONS

# Command-line interface for testing
if __name__ == "__main__":
    print("Available Test Positions:")
    print("=" * 60)
    
    for key, pos in TEST_POSITIONS.items():
        print(f"\n{pos['name']} ({key})")
        print(f"  Description: {pos['description']}")
        print(f"  FEN: {pos['fen']}")
        print(f"  Best moves: {', '.join(pos['best_moves_white'] if 'white' in pos.get('fen', '') else pos.get('best_moves_black', []))}")
