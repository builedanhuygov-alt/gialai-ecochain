"""Approval Gate Sec29-31 levels Sec31."""
LEVELS={"LEVEL_0":"Information only","LEVEL_1":"Analysis","LEVEL_2":"Recommendation","LEVEL_3":"Draft action","LEVEL_4":"Human approval required","LEVEL_5":"Official execution"}
ACTIONS_REQUIRING_APPROVAL=["CREATE_OFFICIAL_ALERT","ASSIGN_OFFICIAL_TASK","CHANGE_OFFICIAL_STATUS","PUBLISH_PUBLIC_DATA","MODIFY_ADMIN_DATA","ISSUE_OFFICIAL_REPORT","EXECUTE_HIGH_IMPACT_ACTION"]
def needs_approval(action:str)->bool: return action in ACTIONS_REQUIRING_APPROVAL
def action_level(action:str)->str:
    if action in ["CREATE_OFFICIAL_ALERT"]: return "LEVEL_4"
    return "LEVEL_2"
