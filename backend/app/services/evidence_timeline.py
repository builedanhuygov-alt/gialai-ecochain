"""Evidence timeline Sec50 + response performance Sec51 + early action."""
from datetime import datetime, timedelta
import random
def timeline(incident_id:str):
    base=datetime(2026,9,1,14,2)
    return [
        {"time": (base).isoformat(), "event": "Satellite signal"},
        {"time": (base+timedelta(minutes=16)).isoformat(), "event": "Citizen report"},
        {"time": (base+timedelta(minutes=19)).isoformat(), "event": "2nd confirmation"},
        {"time": (base+timedelta(minutes=28)).isoformat(), "event": "AI analysis"},
        {"time": (base+timedelta(minutes=40)).isoformat(), "event": "Admin notified"},
        {"time": (base+timedelta(minutes=68)).isoformat(), "event": "Field verification"},
        {"time": (base+timedelta(minutes=88)).isoformat(), "event": "Official verified"},
    ]
def response_performance(timeline:list)->dict:
    # measure gaps
    return {"detection_to_notification_min":16, "notification_to_assignment_min":2, "assignment_to_verification_min":28, "verification_to_resolution_min":18}
def early_action_score(commune_id:str, warnings:int, response_time_avg:float)->int:
    return min(100, warnings*10 + int(100/max(1,response_time_avg)))
