# Be My Eyes – Python object detection tests

Run these when you have a **Python** object detection module (e.g. YOLO + OpenCV).  
The React Native app currently uses **JavaScript** (TensorFlow.js) for detection; see `__tests__/unit/objectDetectionDedupe.test.js` for JS unit tests.

## Setup

```bash
cd python_tests
python -m venv venv
venv\Scripts\activate   # Windows
pip install -r requirements.txt
```

## Run

```bash
python -m pytest -v
```

(Use `python -m pytest` so it works when the Python Scripts folder is not on PATH.)

With coverage (if your detector is in a package):

```bash
python -m pytest -v --cov=object_detection
```

## Test cases (spec)

1. **Detect person** – Input: frame containing a person. Expected: label `"person"` returned.
2. **Unknown object** – Input: frame with unknown object. Expected: object ignored (no label or safe default).
3. **Repeated object** – Same object in multiple detections. Expected: do not announce repeatedly (dedupe by label).

`test_object_detection.py` uses a **mock detector** so tests pass without a real YOLO model. Replace the mock with your real detector and same tests apply.
