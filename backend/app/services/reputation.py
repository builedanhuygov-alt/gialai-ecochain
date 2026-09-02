"""Contributor reputation Sec46."""
from sqlalchemy.orm import Session
from app.models.predictive import Contributor
def update_reputation(db:Session, user_id:str, verified:bool, false_report:bool=False):
    c=db.query(Contributor).filter_by(user_id=user_id).first()
    if not c:
        c=Contributor(user_id=user_id); db.add(c); db.flush()
    c.report_count+=1
    if verified: c.verified_count+=1
    if false_report: c.false_rate= min(1, c.false_rate+0.1)
    c.reputation= max(0, min(100, 70 + c.verified_count*5 - int(c.false_rate*20)))
    db.commit(); return c
def get_reputation(db:Session, user_id:str)->dict:
    c=db.query(Contributor).filter_by(user_id=user_id).first()
    if not c: return {"reputation":70, "report_count":0}
    return {"reputation": c.reputation, "report_count": c.report_count, "false_rate": c.false_rate}
