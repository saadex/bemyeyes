# Be My Eyes – Automated Test Suite

## Overview

- **Unit**: Login validation, command processor, emergency alert, Arduino parsing, object detection dedupe.
- **Functional**: Login screen (valid/invalid/empty/wrong password), voice → navigation/set location/emergency, object detection contract.
- **Business rules**: Obstacle distance parsing (1.5–2 m), voice accuracy/response time (≥85%, <3 s).
- **Integration**: Firebase profile/location updates (mocked), voice → navigation/emergency/set location, emergency + GPS (success and network error).

## Run tests

```bash
# All Jest tests (excludes Python)
npm test

# By category
npm run test:unit
npm run test:functional
npm run test:integration

# CI-style with coverage
npm run test:report
```

## Output: PASS / FAIL report

Jest prints a summary, e.g.:

```
Test Suites: 12 passed, 12 total
Tests:       50 passed, 50 total
```

Coverage is written to:

- **Terminal**: `% Stmts`, `% Branch`, `% Funcs`, `% Lines` per file and summary.
- **`coverage/`**: `lcov.info`, `coverage-final.json` (for tools like Codecov).

## Metrics

- **Response time**: Voice command tests run in <3 s; you can add `console.time`/`console.timeEnd` or Jest `perf` if you need explicit metrics.
- **Detection accuracy**: Unit test `objectDetectionDedupe.test.js` and Python `test_object_detection.py` assert correct labels and no repeated announcements.
- **API success rate**: Emergency and Firebase integration tests mock success/failure; run against the Firebase emulator for real API success rate.

## Coverage goal

Aim for **≥90% code coverage** before heavy integration testing. Current thresholds in `jest.config.js` are set to 0; raise them as you add tests:

```js
coverageThreshold: {
  global: {
    statements: 90,
    branches: 85,
    functions: 90,
    lines: 90,
  },
},
```

## Python object detection tests

The app uses **JavaScript** (TensorFlow.js) for detection; see `__tests__/unit/objectDetectionDedupe.test.js`.

For a **Python** YOLO+OpenCV module:

```bash
cd python_tests
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
pytest -v
```

See `python_tests/README.md` for test cases (detect person, unknown ignored, no repeated announce).

## Firebase emulator

To run integration tests against the Firebase emulator:

1. Install: `npm install -g firebase-tools`
2. Start: `firebase emulators:start --only firestore`
3. In tests, point the app to the emulator (e.g. `connectFirestoreEmulator` in `config/firebase.js` when `process.env.USE_FIREBASE_EMULATOR` is set).
