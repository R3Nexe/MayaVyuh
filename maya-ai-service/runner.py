import sys
import json
import urllib.request
import tempfile
import os

# Ensure the local directory is in path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from comparison import load_model, compare_images

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Missing URL arguments"}))
        sys.exit(1)
        
    url1 = sys.argv[1]
    url2 = sys.argv[2]
    
    tmp1_path = None
    tmp2_path = None
    
    try:
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
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

        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            future1 = executor.submit(get_local_path, url1)
            future2 = executor.submit(get_local_path, url2)
            path1, tmp1_path = future1.result()
            path2, tmp2_path = future2.result()
            
        # Load model and compare
        model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "saved_models/siamese_model.pth")
        model = load_model(model_path)
        
        score = compare_images(path1, path2, model)
        
        # Output clean JSON for the Node.js backend to parse
        print(json.dumps({"similarity_score": float(score)}))
        
    except Exception as e:
        import traceback
        error_details = "".join(traceback.format_exception(type(e), e, e.__traceback__))
        print(json.dumps({"error": str(e), "traceback": error_details}))
        sys.exit(1)
    finally:
        # Cleanup temp files
        try:
            if tmp1_path and os.path.exists(tmp1_path):
                os.remove(tmp1_path)
            if tmp2_path and os.path.exists(tmp2_path):
                os.remove(tmp2_path)
        except:
            pass

if __name__ == "__main__":
    main()
