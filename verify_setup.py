#!/usr/bin/env python
"""
Chess Analyzer - Verification Script
Tests the installation and configuration of the application
"""

import sys
import subprocess

def check_python_version():
    """Check Python version"""
    version = sys.version_info
    print(f"✓ Python {version.major}.{version.minor}.{version.micro}")
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print("  ⚠️  Warning: Python 3.8+ recommended")
        return False
    return True

def check_dependencies():
    """Check if required packages are installed"""
    packages = ['flask', 'chess', 'cv2', 'numpy', 'PIL', 'stockfish']
    all_installed = True
    
    for package in packages:
        try:
            __import__(package if package != 'cv2' else 'cv2')
            print(f"✓ {package} installed")
        except ImportError:
            print(f"✗ {package} NOT installed - run: pip install -r requirements.txt")
            all_installed = False
    
    return all_installed

def check_stockfish():
    """Check if Stockfish is available"""
    try:
        result = subprocess.run(['stockfish', '--version'], 
                              capture_output=True, 
                              text=True, 
                              timeout=5)
        if result.returncode == 0:
            print(f"✓ Stockfish found: {result.stdout.split()[0] if result.stdout else 'Stockfish'}")
            return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    
    print("✗ Stockfish NOT found in PATH")
    print("  Download from: https://stockfishchess.org/download/")
    return False

def check_modules():
    """Check if app modules are present"""
    import os
    modules = [
        'app/__init__.py',
        'app/routes.py',
        'app/chess_engine.py',
        'app/board_detector.py',
        'app/templates/index.html',
        'app/static/css/style.css',
        'app/static/js/app.js',
        'run.py'
    ]
    
    all_present = True
    for module in modules:
        if os.path.exists(module):
            print(f"✓ {module}")
        else:
            print(f"✗ {module} NOT FOUND")
            all_present = False
    
    return all_present

def test_chess_position():
    """Test basic chess functionality"""
    try:
        import chess
        board = chess.Board()
        print(f"✓ Chess board created: {len(list(board.legal_moves))} legal moves")
        return True
    except Exception as e:
        print(f"✗ Chess test failed: {e}")
        return False

def main():
    """Run all checks"""
    print("\n" + "="*50)
    print("Chess Analyzer - System Verification")
    print("="*50 + "\n")
    
    checks = [
        ("Python Version", check_python_version),
        ("Dependencies", check_dependencies),
        ("App Modules", check_modules),
        ("Stockfish Engine", check_stockfish),
        ("Chess Functionality", test_chess_position),
    ]
    
    results = []
    for name, check_func in checks:
        print(f"\n{name}:")
        print("-" * 30)
        results.append(check_func())
    
    print("\n" + "="*50)
    if all(results):
        print("✓ All checks passed! Ready to run.")
        print("\nTo start the application, run:")
        print("  python run.py")
        print("\nThen open: http://localhost:5000")
    else:
        print("✗ Some checks failed. See above for details.")
        print("\nTo install dependencies:")
        print("  python -m pip install -r requirements.txt")
    print("="*50 + "\n")

if __name__ == '__main__':
    main()
