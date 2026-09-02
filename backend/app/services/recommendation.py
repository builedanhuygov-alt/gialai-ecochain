"""Recommendation Engine Sec11."""
from typing import List, Dict, Any
def recommendations(risk_profile:Dict[str,Any], alerts:List[Dict[str,Any]])->List[str]:
    recs=[]
    if risk_profile.get("overall",0)>70: recs.append("Potential fire risk is increasing — Request field verification")
    if any(a["level"]=="CRITICAL" for a in alerts): recs.append("Notify Commune Admin")
    recs.extend(["Monitor nearby forest plots","Check nearby agricultural supply chains"])
    return recs[:4]
