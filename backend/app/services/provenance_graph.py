"""Provenance graph Sec35-36."""
def provenance(lot_code:str)->dict:
    return {
        "nodes": ["Person/Producer","Farm","Plot","Forest","Carbon","Lot","Factory","Shipment"],
        "edges": [("Farm","Plot"), ("Plot","Lot"), ("Lot","Factory"), ("Factory","Shipment")],
        "lot": lot_code
    }
def knowledge_graph(area:str)->dict:
    return {"area": area, "relations": [{"from": area, "to": "Forest", "type": "contains"}, {"from": area, "to": "Incident", "type": "had"}]}
