"""MediaAnalysisAgent Sec20-21 mock."""
import hashlib, random
from typing import Dict, Any
def analyze_image(file_bytes:bytes, filename:str="photo.jpg")->Dict[str,Any]:
    h=hashlib.sha256(file_bytes).hexdigest()
    rng=random.Random(int(h[:8],16))
    # mock visual signals
    signals=["Possible Smoke","Possible Flood","Damaged vegetation","Road blockage","No anomaly"]
    sig=rng.choice(signals)
    conf=rng.randint(65,92)
    return {"visual_signal": sig, "confidence": conf, "requires_verification": True, "model_version":"v1.0", "hash": h[:16], "note": "MediaAnalysisAgent — not conclusive, requires verification"}

def evidence_chain(file_hash:str, metadata:Dict[str,Any], ai_result:Dict[str,Any], community_verified:bool, admin_verified:bool)->Dict[str,Any]:
    return {"upload": file_hash, "metadata": metadata, "ai_analysis": ai_result, "community_verified": community_verified, "admin_verified": admin_verified, "immutable": True}
