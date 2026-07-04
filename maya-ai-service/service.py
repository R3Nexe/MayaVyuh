import os
import sys
import json
import urllib.request
import tempfile
import concurrent.futures
from http.server import HTTPServer, BaseHTTPRequestHandler
import ssl
import numpy as np
from PIL import Image

try:
    import onnxruntime as ort
except ImportError:
    print("FATAL ERROR: onnxruntime not installed")
    sys.exit(1)

# Ensure local directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

print("🚀 [Maya AI Service] Loading ONNX Siamese Model into memory (Lightweight inference)...")
model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "saved_models/siamese_model.onnx")

if not os.path.exists(model_path):
    print(f"FATAL ERROR: ONNX model not found at {model_path}")
    sys.exit(1)

sess = ort.InferenceSession(model_path)
input_name1 = sess.get_inputs()[0].name
input_name2 = sess.get_inputs()[1].name
print("✅ [Maya AI Service] ONNX Model loaded successfully! Fast lightweight inference ready.")

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

download_pool = concurrent.futures.ThreadPoolExecutor(max_workers=16)

import threading
inference_lock = threading.Semaphore(4)

import time
def get_local_path(url):
    if url.startswith("s3://"):
        parts = url.replace("s3://", "https://", 1).split("/", 3)
        if len(parts) >= 4:
            url = f"https://{parts[2]}.s3.amazonaws.com/{parts[3]}"

    if os.path.exists(url):
        return url, None
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
    }
    for attempt in range(2):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=3, context=ctx) as response, open(tmp.name, 'wb') as out_file:
                out_file.write(response.read())
            return tmp.name, tmp.name
        except Exception as e:
            if attempt == 1:
                raise e
            time.sleep(0.3)
    return tmp.name, tmp.name

def preprocess(image_path):
    img = Image.open(image_path).convert('RGB')
    img = img.resize((224, 224), Image.Resampling.LANCZOS)
    img_data = np.array(img).astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    img_data = (img_data - mean) / std
    img_data = np.transpose(img_data, (2, 0, 1))
    return np.expand_dims(img_data, axis=0)

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
                
                with inference_lock:
                    img1 = preprocess(path1)
                    img2 = preprocess(tmp2_path or path2)
                    out1, out2 = sess.run(None, {input_name1: img1, input_name2: img2})
                    similarity = np.dot(out1[0], out2[0]) / (np.linalg.norm(out1[0]) * np.linalg.norm(out2[0]))
                    score = ((float(similarity) + 1.0) / 2.0) * 100.0
                
                if tmp1_path and os.path.exists(tmp1_path):
                    try: os.remove(tmp1_path)
                    except: pass
                if tmp2_path and os.path.exists(tmp2_path):
                    try: os.remove(tmp2_path)
                    except: pass
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"similarity_score": score}).encode())
                
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
        pass

def run(server_class=HTTPServer, handler_class=SiameseRequestHandler, port=5001):
    server_address = ('0.0.0.0', port)
    httpd = server_class(server_address, handler_class)
    print(f"🌐 [Maya AI Service] Standalone Microservice running on http://0.0.0.0:{port}/api/similarity")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 0)) or (int(sys.argv[1]) if len(sys.argv) > 1 else 5001)
    run(port=port)
