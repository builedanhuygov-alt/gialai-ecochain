"""ImpactCascade Sec59-60."""
def cascade(event:str, data:dict)->dict:
    if event=="Flood":
        return {"path": ["Flood","Road blocked","Farm inaccessible","Collection delayed","Factory supply reduced","Export delay"], "graph": {"DISASTER":["INFRASTRUCTURE"],"INFRASTRUCTURE":["AGRICULTURE"],"AGRICULTURE":["LOGISTICS"],"LOGISTICS":["ECONOMY"]}}
    return {"path": [event], "graph": {}}
