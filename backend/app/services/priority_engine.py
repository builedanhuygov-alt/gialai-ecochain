"""Priority Engine Sec61."""
def priority(severity:int, exposure:int, confidence:int, time_sensitivity:int, impact:int)->int:
    # configurable
    return int(severity*0.3 + exposure*0.2 + confidence*0.2 + time_sensitivity*0.15 + impact*0.15)
