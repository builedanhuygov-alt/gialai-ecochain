"""Model performance/versioning/drift Sec57-59."""
from sqlalchemy.orm import Session
from app.models.predictive import ModelMetric
def record_metric(db:Session, model:str, version:str, accuracy:float=0.85, fp:float=0.1, fn:float=0.08):
    m=ModelMetric(model=model, version=version, accuracy=accuracy, false_positive=fp, false_negative=fn)
    db.add(m); db.commit(); return m
def check_drift(db:Session, model:str, threshold:float=0.05)->dict:
    metrics=db.query(ModelMetric).filter_by(model=model).order_by(ModelMetric.created_at.desc()).limit(2).all()
    if len(metrics)<2: return {"drift": False}
    drift= abs(metrics[0].accuracy - metrics[1].accuracy) > threshold
    if drift:
        metrics[0].drift_detected=1; db.commit()
    return {"drift": drift, "message": "MODEL DRIFT DETECTED — review/retrain" if drift else "No drift"}
