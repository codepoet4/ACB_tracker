#!/usr/bin/env python
"""
Chess Analyzer - Main entry point
"""
from app import create_app

if __name__ == '__main__':
    app = create_app()
    app.run(debug=False, host='0.0.0.0', port=5000, use_reloader=False)
