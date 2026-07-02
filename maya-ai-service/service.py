import os
import sys
import json
import urllib.request
import tempfile
import concurrent.futures
from http.server import HTTPServer, BaseHTTPRequestHandler
import ssl

# Ensure local directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from comparison import load_model, compare_images

print("🚀 [Maya AI Service] Loading ResNet50 Siamese Model into memory...")
model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "saved_models/siamese_model.pth")
model = load_model(model_path)
print("✅ [Maya AI Service] Siamese Model loaded successfully! Ready for high-speed evaluations.")

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# ThreadPoolExecutor to handle concurrent image downloads without blocking inference
download_pool = concurrent.futures.ThreadPoolExecutor(max_workers=16)
# Semaphore to limit simultaneous GPU/CPU PyTorch evaluations so memory never overflows with 100+ players
import threading
inference_lock = threading.Semaphore(4)

import time
def get_local_path(url):
    if os.path.exists(url):
        return url, None
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
    }
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=30, context=ctx) as response, open(tmp.name, 'wb') as out_file:
                out_file.write(response.read())
            return tmp.name, tmp.name
        except Exception as e:
            if attempt == 2:
                raise e
            time.sleep(1.5 * (attempt + 1))
    return tmp.name, tmp.name

class SiameseRequestHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/similarity':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                url1 = data.get('original_url')
                url2 = data.get('submitted_url')
                
                if not url1 or not url2:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "original_url and submitted_url required"}).encode())
                    return
                
                # Download both images in parallel
                future1 = download_pool.submit(get_local_path, url1)
                future2 = download_pool.submit(get_local_path, url2)
                path1, tmp1_path = future1.result()
                path2, tmp2_path = future2.result()
                
                # Evaluate using loaded model under concurrency lock
                with inference_lock:
                    score = compare_images(path1, tmp2_path or path2, model)
                
                # Cleanup temporary images
                if tmp1_path and os.path.exists(tmp1_path):
                    try: os.remove(tmp1_path)
                    except: pass
                if tmp2_path and os.path.exists(tmp2_path):
                    try: os.remove(tmp2_path)
                    except: pass
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"similarity_score": float(score)}).encode())
                
            except Exception as e:
                import traceback
                traceback.print_exc()
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Suppress routine log clutter
        pass

def run(server_class=HTTPServer, handler_class=SiameseRequestHandler, port=5001):
    server_address = ('0.0.0.0', port)
    httpd = server_class(server_address, handler_class)
    print(f"🌐 [Maya AI Service] Standalone Microservice running on http://0.0.0.0:{port}/api/similarity")
    print("💡 To use this in Node.js backend, set environment variable: AI_SERVICE_URL=http://localhost:5001")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5001
    run(port=port)
