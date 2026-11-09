# NyayaDari backend

## Install and run (Windows PowerShell)

From the project root:

```powershell
cd backend
py -3.10 -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
python -m uvicorn main:app --reload
```

The API is available at `http://127.0.0.1:8000`. Interactive API documentation is at
`http://127.0.0.1:8000/docs`.

`GET /health` returns the service status. `POST /analyze` accepts JSON with a required
`issue` string (up to 5,000 characters) and an optional `jurisdiction` string (up to 200
characters). It uses the saved complaint classifier to return a preliminary category,
general suggested documents, and category-specific procedural next steps. An uncertain
prediction returns no category-specific checklist or next steps and asks for more detail.

`FRONTEND_ORIGINS` in `.env` is a comma-separated list of allowed browser origins. The
example enables the common local Next.js addresses.

## Complaint classifier (baseline ML)

The standalone classifier uses scikit-learn TF-IDF unigram/bigram features and logistic
regression to predict `employment`, `rental_property`, or `consumer`. It is not an LLM,
does not provide legal advice, and is used by the `/analyze` API route.

`data/legal_complaints.csv` contains **synthetic** examples across the three supported
categories. They are created only for model development and do not describe real people,
legal outcomes, or legal provisions. The current dataset has 152 examples (51 employment,
51 rental/property, and 50 consumer). These examples are small and synthetic; they do not
represent the language or diversity of real complaints.

From the `backend` directory, install the declared dependencies and train/evaluate:

```powershell
python -m pip install -r requirements.txt
python scripts/train_classifier.py
```

Training validates the CSV and duplicate complaint text, then uses a reproducible
stratified 80:20 train/test split. TF-IDF and Logistic Regression are fitted using only
the training portion. A 5-fold stratified cross-validation on that training portion
selects an uncertainty threshold to maximize accepted coverage while meeting a target
selective precision of 0.95 on its out-of-fold predictions. The held-out test portion is
not used for threshold selection. The threshold is stored with the saved pipeline at
`models/issue_classifier.joblib`; metrics, per-category results, confusion matrix, and
training-only rejection statistics are written to
`reports/classifier_evaluation.json`.

The threshold is a cautious prototype setting, not a legally validated confidence
boundary. Logistic Regression's maximum class probability is treated only as a model
score; it is not calibrated and does not guarantee correctness. Validation and test
metrics are preliminary because they come from a small synthetic dataset and may reflect
its wording patterns. They do not estimate real-world legal classification accuracy.

Run the unit tests after training:

```powershell
python -m unittest discover -s tests -v
```

To try a complaint from the backend directory after training:

```powershell
python -c "from services.classifier import classify_issue; print(classify_issue('My employer has not paid my salary for two months.'))"
```

The result contains the predicted category (or `None` when the saved model score is below
the training-selected threshold) and the maximum class probability as an uncalibrated
model score. An uncertain API result intentionally contains no category-specific
documents or next steps. The model must be trained before prediction; a missing model or
threshold raises an error. Keep model artifacts from trusted sources because loading
joblib files can execute code.
