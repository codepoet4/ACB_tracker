"""
Flask application factory
"""
from flask import Flask


def create_app():
    """Create and configure the Flask application"""
    app = Flask(__name__)
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
    app.config['UPLOAD_FOLDER'] = 'uploads'
    
    # Register blueprints
    from app.routes import bp, shutdown_session
    app.register_blueprint(bp)
    
    # Register teardown handler
    app.teardown_appcontext(shutdown_session)
    
    return app
