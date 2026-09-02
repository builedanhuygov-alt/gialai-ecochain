"""AgentRegistry Sec10 + health Sec11 + communication Sec12."""
from typing import Dict, List
REGISTRY={
    "ForestGuard": {"capabilities":["forest_change_detection","vegetation_analysis","forest_risk"],"input_schema":{"location":"geo"},"output_schema":{"risk": "0-100"},"required_data":["satellite"],"risk_level":"MEDIUM","available":True,"version":"v1.0"},
    "DisasterGuard": {"capabilities":["fire_risk","flood_risk","landslide_risk"],"input_schema":{"rainfall":"mm"},"output_schema":{"score":0},"required_data":["weather","satellite"],"risk_level":"HIGH","available":True,"version":"v1.0"},
    "CarbonGuard": {"capabilities":["carbon_stock","carbon_change"],"input_schema":{"forest_area":"ha"},"output_schema":{"stock":0},"required_data":["forest"],"risk_level":"LOW","available":True,"version":"v1.0"},
    "EUDRGuard": {"capabilities":["eudr_readiness","traceability"],"input_schema":{"lot_id":"str"},"output_schema":{"readiness":0},"required_data":["farm","plot"],"risk_level":"MEDIUM","available":True,"version":"v1.0"},
    "GreenRouteAgent": {"capabilities":["route_optimization","co2_estimation"],"input_schema":{"origin":"geo"},"output_schema":{"route":{}},"required_data":["roads"],"risk_level":"LOW","available":True,"version":"v1.0"},
    "MediaAnalysisAgent": {"capabilities":["visual_signal"],"input_schema":{"image":"bytes"},"output_schema":{"signal":"str"},"required_data":["image"],"risk_level":"LOW","available":True,"version":"v1.0"},
    "PredictiveEcoAgent": {"capabilities":["forecast"],"input_schema":{"horizon":"str"},"output_schema":{"forecast":[]},"required_data":["historical"],"risk_level":"MEDIUM","available":True,"version":"v1.0"},
    "VerificationAgent": {"capabilities":["community_verification"],"input_schema":{"report":"id"},"output_schema":{"status":"str"},"required_data":["community"],"risk_level":"MEDIUM","available":True,"version":"v1.0"},
}
HEALTH={"ForestGuard":"ACTIVE","DisasterGuard":"ACTIVE","CarbonGuard":"ACTIVE","EUDRGuard":"ACTIVE","GreenRouteAgent":"ACTIVE","MediaAnalysisAgent":"ACTIVE","PredictiveEcoAgent":"ACTIVE","VerificationAgent":"ACTIVE"}
def list_agents()->List[Dict]: return [{"agent_id":k, "name":k, **v, "health": HEALTH.get(k,"ACTIVE")} for k,v in REGISTRY.items()]
def get_agent(name:str): return REGISTRY.get(name)
def set_health(name:str, status:str): HEALTH[name]=status
def select_agents(goal_type:str)->List[str]:
    mapping={"FOREST_PROTECTION":["ForestGuard"],"DISASTER_PREPAREDNESS":["DisasterGuard"],"CARBON_REDUCTION":["CarbonGuard"],"EUDR_COMPLIANCE":["EUDRGuard"],"GREEN_LOGISTICS":["GreenRouteAgent"],"SUPPLY_CHAIN_RESILIENCE":["GreenRouteAgent","EUDRGuard"],"AGRICULTURAL_RESILIENCE":["DisasterGuard","PredictiveEcoAgent"]}
    return mapping.get(goal_type, ["ForestGuard","DisasterGuard"])
def make_message(sender:str, receiver:str, task_id:str, payload:dict, confidence:int=80)->dict:
    import uuid, datetime
    return {"message_id": str(uuid.uuid4()), "sender": sender, "receiver": receiver, "task_id": task_id, "timestamp": datetime.datetime.utcnow().isoformat(), "payload": payload, "confidence": confidence, "model_version":"v1.0", "data_sources":["mock"]}
