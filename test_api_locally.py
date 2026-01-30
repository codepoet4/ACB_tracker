"""Test the full API endpoint locally"""
from app import create_app
import json

app = create_app()

with app.test_client() as client:
    img_path = r'C:\Users\rparks\Code\chess-analyzer\Screenshot 2026-01-27 150015.png'
    
    with open(img_path, 'rb') as f:
        response = client.post('/api/analyze', 
            data={'image': (f, 'test.png'), 'side': 'white'},
            content_type='multipart/form-data'
        )
    
    print(f"Response status: {response.status_code}")
    data = response.get_json()
    print(f"Response JSON: {json.dumps(data, indent=2)}")
    
    if 'detected_fen' in data:
        print(f"\nDetected FEN from response: {data['detected_fen']}")
        print(f"Length: {len(data['detected_fen'])}")
